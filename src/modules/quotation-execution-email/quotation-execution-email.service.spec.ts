import {
  QuotationEmailTransport,
  PartialQuotationEmailDeliveryError,
} from './quotation-email-transport.service';

import { Test } from '@nestjs/testing';
import { TaskService } from '@Modules/task/task.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import { TaskRepository } from '@Modules/task/task.repository';
import { ProjectService } from '@Modules/project/project.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { TASK_TYPES } from '@Modules/task/constants/task-type.constant';
import { TASK_STATUSES } from '@Modules/task/constants/task-status.constant';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { QuotationExecutionEmailService } from './quotation-execution-email.service';
import { QUOTATION_EMAIL_STATUS } from './constants/quotation-execution-email.constant';
import { QuotationExecutionEmailRepository } from './quotation-execution-email.repository';
import { CustomerContactService } from '@Modules/customer-contact/customer-contact.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import type { SendQuotationExecutionEmailDto } from './dto/send-quotation-execution-email.dto';

const input: SendQuotationExecutionEmailDto = {
  requestId: 'f29c0715-5a7a-45f9-841a-845d4f1f4627',
  recipientContactIds: ['fa7626f2-f6ae-42fa-a901-2f184bd4ffeb'],
  architectContactId: 'fa7626f2-f6ae-42fa-a901-2f184bd4ffeb',
  planVersion: '03',
  planFileId: 'plan-file',
  zipFileId: 'zip-file',
};
const actor: IAuthorizedUser = {
  id: 'f613fa13-a05b-4cce-af39-7e95311a4e75',
  firstName: 'Dana',
  lastName: 'Levi',
  email: 'dana@example.test',
  phone: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  role: USER_ROLES.PROJECT_MANAGER,
  employeeNumber: '1',
  deletedAt: null,
  permissions: [],
};

const setup = async () => {
  const task = {
    id: 'task-id',
    taskType: TASK_TYPES.QUOTATION,
    status: TASK_STATUSES.PROPOSAL_SENT,
    projectId: 'project-id',
    project: { customer: { id: 'customer-id' } },
    customerId: null,
  };
  const state: { record: Record<string, unknown> | null } = { record: null };
  const tasks = { getById: jest.fn().mockResolvedValue(task) };
  const taskRepository = { findById: jest.fn().mockResolvedValue(task) };
  const projects = {
    getById: jest.fn().mockResolvedValue({
      id: 'project-id',
      name: 'Project',
      parentProjectId: null,
      customerApartment: '12',
    }),
  };
  const contacts = {
    list: jest.fn().mockResolvedValue([
      {
        id: input.architectContactId,
        name: 'Architect',
        role: 'Architect',
        email: 'architect@example.test',
      },
    ]),
  };
  const drive = {
    readProjectAttachment: jest
      .fn()
      .mockResolvedValueOnce({
        name: 'plan.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('pdf'),
      })
      .mockResolvedValueOnce({
        name: 'plans.zip',
        mimeType: 'application/zip',
        content: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x61]),
      }),
  };
  const transactions = {
    run: jest.fn((work: (transaction: object) => Promise<unknown>) => work({})),
    lockKey: jest.fn().mockImplementation(() => Promise.resolve()),
  };
  const records = {
    findByTaskId: jest.fn(() => Promise.resolve(state.record)),
    create: jest.fn((values: Record<string, unknown>) => {
      state.record = { ...values, updatedAt: new Date() };
      return Promise.resolve(state.record);
    }),
    update: jest.fn((_taskId: string, values: Record<string, unknown>) => {
      state.record = { ...state.record, ...values, updatedAt: new Date() };
      return Promise.resolve();
    }),
    updateIfRequest: jest.fn(
      (_taskId: string, requestId: string, values: Record<string, unknown>) => {
        if (state.record?.requestId !== requestId) return Promise.resolve(0);
        state.record = { ...state.record, ...values, updatedAt: new Date() };
        return Promise.resolve(1);
      },
    ),
  };
  const transport = {
    assertReady: jest.fn(),
    send: jest.fn().mockResolvedValue('<sent@example.test>'),
  };
  const module = await Test.createTestingModule({
    providers: [
      QuotationExecutionEmailService,
      { provide: TaskService, useValue: tasks },
      { provide: TaskRepository, useValue: taskRepository },
      { provide: ProjectService, useValue: projects },
      { provide: CustomerContactService, useValue: contacts },
      { provide: ProjectDriveService, useValue: drive },
      { provide: DatabaseTransactionService, useValue: transactions },
      { provide: QuotationExecutionEmailRepository, useValue: records },
      { provide: QuotationEmailTransport, useValue: transport },
    ],
  }).compile();
  const service = module.get(QuotationExecutionEmailService);
  return {
    service,
    tasks,
    task,
    drive,
    transport,
    records,
    getRecord: () => state.record,
    setRecord: (value: Record<string, unknown>) => {
      state.record = value;
    },
  };
};

describe('QuotationExecutionEmailService', () => {
  it('derives the preview from the server template without sending', async () => {
    const { service, transport } = await setup();
    const preview = await service.getPreview(
      'task-id',
      input.architectContactId,
      '03',
      actor,
    );
    expect(preview.subject).toBe(
      'Project | 12 | Architect | תוכנית מיזוג אוויר לביצוע',
    );
    expect(preview.body).toContain('גרסת תוכנית 03');
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('does not send while reading optional completion context', async () => {
    const { service, transport } = await setup();
    const context = await service.getContext('task-id');
    expect(context.apartmentNumber).toBe('12');
    expect(context.contacts).toHaveLength(1);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('sends exactly the chosen plan and ZIP once and records the receipt', async () => {
    const { service, transport, records, drive } = await setup();
    const receipt = await service.send('task-id', input, actor);
    expect(receipt?.status).toBe(QUOTATION_EMAIL_STATUS.SENT);
    expect(drive.readProjectAttachment).toHaveBeenNthCalledWith(
      1,
      'project-id',
      'plan-file',
      expect.any(Number),
    );
    expect(drive.readProjectAttachment).toHaveBeenNthCalledWith(
      2,
      'project-id',
      'zip-file',
      expect.any(Number),
    );
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['architect@example.test'],
        attachments: [
          expect.objectContaining({ filename: 'plan.pdf' }),
          expect.objectContaining({ filename: 'plans.zip' }),
        ],
      }),
    );
    expect(records.create).toHaveBeenCalledTimes(1);
    const repeat = await service.send('task-id', input, actor);
    expect(repeat?.status).toBe(QUOTATION_EMAIL_STATUS.SENT);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('rejects a recipient outside the linked customer', async () => {
    const { service, transport } = await setup();
    await expect(
      service.send(
        'task-id',
        {
          ...input,
          recipientContactIds: [input.architectContactId, 'other-id'],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('marks an attachment preparation failure as retryable without sending', async () => {
    const { service, drive, transport, getRecord } = await setup();
    drive.readProjectAttachment
      .mockReset()
      .mockRejectedValue(
        new BadRequestException('File is outside this project'),
      );
    await expect(service.send('task-id', input, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(getRecord()?.status).toBe(QUOTATION_EMAIL_STATUS.FAILED);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('blocks an automatic retry after uncertain delivery', async () => {
    const { service, transport, getRecord } = await setup();
    transport.send.mockRejectedValue(new Error('Connection lost'));
    await expect(service.send('task-id', input, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(getRecord()?.status).toBe(QUOTATION_EMAIL_STATUS.UNCERTAIN);
    await expect(
      service.send(
        'task-id',
        { ...input, requestId: '2cd1ac16-4b80-4d0e-a4ca-012bfbfbdc21' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
});

describe('QuotationExecutionEmailService recovery', () => {
  it('reclaims only an expired preparation before sending', async () => {
    const { service, setRecord, records } = await setup();
    setRecord({
      taskId: 'task-id',
      requestId: 'old-request',
      status: QUOTATION_EMAIL_STATUS.PREPARING,
      updatedAt: new Date(Date.now() - 31 * 60 * 1000),
      providerMessageId: null,
    });
    const result = await service.send('task-id', input, actor);
    expect(result?.status).toBe(QUOTATION_EMAIL_STATUS.SENT);
    expect(records.update).toHaveBeenCalledWith(
      'task-id',
      expect.objectContaining({
        requestId: input.requestId,
        status: QUOTATION_EMAIL_STATUS.PREPARING,
      }),
      expect.anything(),
    );
  });

  it('records partial SMTP acceptance as uncertain with provider ID', async () => {
    const { service, transport, getRecord } = await setup();
    transport.send.mockRejectedValue(
      new PartialQuotationEmailDeliveryError('<partial@example.test>', 1, 1),
    );
    await expect(service.send('task-id', input, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(getRecord()?.status).toBe(QUOTATION_EMAIL_STATUS.UNCERTAIN);
    expect(getRecord()?.errorCode).toBe('PARTIAL_DELIVERY');
    expect(getRecord()?.providerMessageId).toBe('<partial@example.test>');
  });
});
