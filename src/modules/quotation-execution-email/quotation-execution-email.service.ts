import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  QuotationEmailTransport,
  PartialQuotationEmailDeliveryError,
} from './quotation-email-transport.service';

import {
  QUOTATION_EMAIL_LIMITS,
  QUOTATION_EMAIL_STATUS,
} from './constants/quotation-execution-email.constant';

import isEmail from 'validator/lib/isEmail';
import { TaskService } from '@Modules/task/task.service';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { TaskRepository } from '@Modules/task/task.repository';
import { ProjectService } from '@Modules/project/project.service';
import { TASK_TYPES } from '@Modules/task/constants/task-type.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { TASK_STATUSES } from '@Modules/task/constants/task-status.constant';
import { resolveTaskCustomerId } from '@Modules/task/utilities/task-link.utility';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { QuotationExecutionEmail } from './entities/quotation-execution-email.entity';
import { SendQuotationExecutionEmailDto } from './dto/send-quotation-execution-email.dto';
import { QuotationExecutionEmailRepository } from './quotation-execution-email.repository';
import { CustomerContactService } from '@Modules/customer-contact/customer-contact.service';
import { renderQuotationExecutionEmail } from './utilities/quotation-email-template.utility';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

@Injectable()
export class QuotationExecutionEmailService {
  private readonly logger = new TypedLogger<Meta>(
    QuotationExecutionEmailService.name,
  );

  constructor(
    private readonly tasks: TaskService,
    private readonly taskRepository: TaskRepository,
    private readonly projects: ProjectService,
    private readonly contacts: CustomerContactService,
    private readonly drive: ProjectDriveService,
    private readonly transactions: DatabaseTransactionService,
    private readonly records: QuotationExecutionEmailRepository,
    private readonly transport: QuotationEmailTransport,
  ) {}

  async getContext(taskId: string) {
    const task = await this.requireEligibleTask(taskId);
    const project = await this.projects.getById(task.projectId!);
    const parent = project.parentProjectId
      ? await this.projects.getById(project.parentProjectId)
      : project;
    const customerId =
      resolveTaskCustomerId(task) ?? project.customerId ?? parent.customerId;
    if (!customerId) {
      throw new ConflictException('The quotation task needs a linked customer');
    }
    const [contacts, record] = await Promise.all([
      this.contacts.list(customerId),
      this.records.findByTaskId(taskId),
    ]);
    return {
      taskId,
      projectId: project.id,
      projectName: parent.name,
      apartmentNumber: project.customerApartment?.trim() || null,
      contacts: contacts
        .filter((contact) => contact.email && isEmail(contact.email))
        .map((contact) => ({
          id: contact.id,
          name: contact.name,
          role: contact.role,
          email: contact.email,
        })),
      delivery: this.toReceipt(record),
    };
  }

  async getStatus(taskId: string) {
    await this.requireEligibleTask(taskId);
    return this.toReceipt(await this.records.findByTaskId(taskId));
  }

  async getPreview(
    taskId: string,
    architectContactId: string,
    planVersion: string,
    actor: IAuthorizedUser,
  ) {
    const context = await this.getContext(taskId);
    const architect = context.contacts.find(
      (contact) => contact.id === architectContactId,
    );
    const version = planVersion.trim();
    if (!architect || !context.apartmentNumber || !version) {
      throw new BadRequestException(
        'Select a linked architect contact, apartment number and plan version',
      );
    }
    const senderName = `${actor.firstName} ${actor.lastName}`.trim();
    const template = renderQuotationExecutionEmail({
      projectName: context.projectName,
      apartmentNumber: context.apartmentNumber,
      architectName: architect.name,
      planVersion: version,
      senderName,
    });
    return { subject: template.subject, body: template.text, senderName };
  }

  async send(
    taskId: string,
    input: SendQuotationExecutionEmailDto,
    actor: IAuthorizedUser,
  ) {
    const context = await this.getContext(taskId);
    if (
      context.delivery?.status === QUOTATION_EMAIL_STATUS.SENT &&
      context.delivery.requestId === input.requestId
    ) {
      return context.delivery;
    }
    if (!context.apartmentNumber) {
      throw new ConflictException(
        'Set the apartment number before preparing the email',
      );
    }
    if (input.planFileId === input.zipFileId) {
      throw new BadRequestException('Select two different attachments');
    }
    const ids = new Set(input.recipientContactIds);
    if (!ids.has(input.architectContactId)) {
      throw new BadRequestException(
        'The architect must be one of the selected recipients',
      );
    }
    const selected = context.contacts.filter((contact) => ids.has(contact.id));
    if (selected.length !== ids.size) {
      throw new BadRequestException(
        'All recipients must be linked to this customer and have email',
      );
    }
    const architect = selected.find(
      (contact) => contact.id === input.architectContactId,
    )!;
    const emails = [
      ...new Set(
        selected.map((contact) => contact.email!.trim().toLowerCase()),
      ),
    ];
    const senderName = `${actor.firstName} ${actor.lastName}`.trim();
    const version = input.planVersion.trim();
    if (!version || !senderName) {
      throw new BadRequestException(
        'Plan version and sender name are required',
      );
    }
    const template = renderQuotationExecutionEmail({
      projectName: context.projectName,
      apartmentNumber: context.apartmentNumber,
      architectName: architect.name,
      planVersion: version,
      senderName,
    });
    this.transport.assertReady(emails);

    const existing = await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`quotation-email:${taskId}`, transaction);
      const task = await this.taskRepository.findById(taskId, transaction);
      if (
        !task ||
        task.taskType !== TASK_TYPES.QUOTATION ||
        task.status !== TASK_STATUSES.PROPOSAL_SENT
      ) {
        throw new ConflictException(
          'The quotation task is no longer completed',
        );
      }
      const record = await this.records.findByTaskId(taskId, transaction);
      if (
        record?.status === QUOTATION_EMAIL_STATUS.SENT &&
        record.requestId === input.requestId
      ) {
        return record;
      }
      const stalePreparation =
        record?.status === QUOTATION_EMAIL_STATUS.PREPARING &&
        Date.now() - record.updatedAt.getTime() >
          QUOTATION_EMAIL_LIMITS.PREPARATION_LEASE_MS;
      if (
        record &&
        record.status !== QUOTATION_EMAIL_STATUS.FAILED &&
        !stalePreparation
      ) {
        throw new ConflictException(
          'An email attempt already exists for this task',
        );
      }
      if (record?.requestId === input.requestId) {
        throw new ConflictException(
          'Use a new request ID to retry a failed preparation',
        );
      }
      const values = {
        requestId: input.requestId,
        senderUserId: actor.id,
        architectContactId: architect.id,
        planFileId: input.planFileId,
        zipFileId: input.zipFileId,
        planVersion: version,
        recipientContactIds: input.recipientContactIds,
        recipientEmails: emails,
        subject: template.subject,
        body: template.text,
        status: QUOTATION_EMAIL_STATUS.PREPARING,
        providerMessageId: null,
        errorCode: null,
      };
      if (record) {
        await this.records.update(taskId, values, transaction);
        return null;
      }
      await this.records.create({ taskId, ...values }, transaction);
      return null;
    });
    if (existing) return this.toReceipt(existing);

    const [plan, zip, logo] = await this.prepareAttachments(
      context.projectId,
      input,
    ).catch(async (error: unknown) => {
      this.logger.error({
        error,
        taskId,
        requestId: input.requestId,
        message: 'Quotation execution email preparation failed',
      });
      await this.records.updateIfRequest(taskId, input.requestId, {
        status: QUOTATION_EMAIL_STATUS.FAILED,
        errorCode: 'PREPARATION_FAILED',
      });
      throw error;
    });

    await this.transactions.run(async (transaction) => {
      await this.transactions.lockKey(`quotation-email:${taskId}`, transaction);
      const current = await this.records.findByTaskId(taskId, transaction);
      if (
        current?.requestId !== input.requestId ||
        current.status !== QUOTATION_EMAIL_STATUS.PREPARING
      ) {
        throw new ConflictException('Email preparation has expired');
      }
      await this.records.updateIfRequest(
        taskId,
        input.requestId,
        { status: QUOTATION_EMAIL_STATUS.SENDING },
        transaction,
      );
    });
    try {
      const providerMessageId = await this.transport.send({
        to: emails,
        subject: template.subject,
        text: template.text,
        html: template.html,
        replyTo: actor.email,
        requestId: input.requestId,
        logo,
        attachments: [
          {
            filename: plan.name,
            content: plan.content,
            contentType: plan.mimeType,
          },
          {
            filename: zip.name,
            content: zip.content,
            contentType: zip.mimeType,
          },
        ],
      });
      await this.records.updateIfRequest(taskId, input.requestId, {
        status: QUOTATION_EMAIL_STATUS.SENT,
        providerMessageId,
      });
      return this.toReceipt(await this.records.findByTaskId(taskId));
    } catch (error) {
      this.logger.error({
        error,
        taskId,
        requestId: input.requestId,
        message: 'Quotation execution email delivery could not be confirmed',
      });
      await this.records.updateIfRequest(taskId, input.requestId, {
        status: QUOTATION_EMAIL_STATUS.UNCERTAIN,
        errorCode:
          error instanceof PartialQuotationEmailDeliveryError
            ? 'PARTIAL_DELIVERY'
            : 'DELIVERY_UNCERTAIN',
        providerMessageId:
          error instanceof PartialQuotationEmailDeliveryError
            ? error.messageId
            : null,
      });
      throw new ConflictException(
        'Email delivery could not be confirmed. Check the delivery status before retrying.',
      );
    }
  }

  private async prepareAttachments(
    projectId: string,
    input: SendQuotationExecutionEmailDto,
  ) {
    const [plan, zip, logo] = await Promise.all([
      this.drive.readProjectAttachment(
        projectId,
        input.planFileId,
        QUOTATION_EMAIL_LIMITS.MAX_FILE_BYTES,
      ),
      this.drive.readProjectAttachment(
        projectId,
        input.zipFileId,
        QUOTATION_EMAIL_LIMITS.MAX_FILE_BYTES,
      ),
      this.transport.loadLogo(),
    ]);
    if (
      /\.zip$/i.test(plan.name) ||
      !/\.zip$/i.test(zip.name) ||
      !['504b0304', '504b0506', '504b0708'].includes(
        zip.content.subarray(0, 4).toString('hex'),
      )
    ) {
      throw new BadRequestException('Select a plan file and a valid ZIP file');
    }
    if (
      plan.content.length + zip.content.length >
      QUOTATION_EMAIL_LIMITS.MAX_TOTAL_BYTES
    ) {
      throw new BadRequestException('Selected files are too large for email');
    }
    return [plan, zip, logo] as const;
  }

  private async requireEligibleTask(taskId: string) {
    const task = await this.tasks.getById(taskId);
    if (task.taskType !== TASK_TYPES.QUOTATION || !task.projectId) {
      throw new NotFoundException('Quotation task not found');
    }
    if (task.status !== TASK_STATUSES.PROPOSAL_SENT) {
      throw new ConflictException(
        'Complete the quotation task before preparing the email',
      );
    }
    return task;
  }

  private toReceipt(record: QuotationExecutionEmail | null) {
    return record
      ? {
          status: record.status,
          requestId: record.requestId,
          providerMessageId: record.providerMessageId,
          updatedAt: record.updatedAt,
          retryable:
            record.status === QUOTATION_EMAIL_STATUS.FAILED ||
            (record.status === QUOTATION_EMAIL_STATUS.PREPARING &&
              Date.now() - record.updatedAt.getTime() >
                QUOTATION_EMAIL_LIMITS.PREPARATION_LEASE_MS),
        }
      : null;
  }
}
