import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  estimateSubtotal,
  EstimatePricingService,
} from './estimate-pricing.service';

import type {
  EstimateSketchDto,
  EstimateQuotationDto,
} from './dto/engineering-estimate.dto';

import {
  ESTIMATE_STATUS,
  ESTIMATE_PLAN_MIME,
  ESTIMATE_DOCUMENT_KIND,
} from './constants/engineering-estimate.constant';

import type {
  IEstimateLine,
  IEstimateView,
  IEstimateReviewSnapshot,
} from './interfaces/engineering-estimate.interface';

import { Transaction } from 'sequelize';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectService } from '@Modules/project/project.service';
import { assertPermissions } from '@Utilities/permission.utility';
import { CustomerService } from '@Modules/customer/customer.service';
import { EstimateDocumentService } from './estimate-document.service';
import { ENGINEERING_QUANTITY_RULES_VERSION } from './quantity-rules';
import { QuotationService } from '@Modules/quotation/quotation.service';
import { EngineeringEstimateService } from './engineering-estimate.service';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { EngineeringEstimateRepository } from './engineering-estimate.repository';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

interface IEstimateActor {
  id: string;
  actor: IAuthorizedUser;
}

interface IPairedSamples {
  areaIds: string[];
  images: {
    name: string;
    areaName: string;
    mimeType: string;
    base64: string;
  }[];
}

const requirePricedLines = (lines: IEstimateLine[]): void => {
  const hasMissingPrice = lines.some(
    (line): boolean => line.unitPrice === null || line.catalogueItemId === null,
  );
  if (lines.length === 0 || hasMissingPrice) {
    throw new BadRequestException(
      'יש להוסיף שורות ולהשלים את כל המחירים לפני הפקת הסקיצה',
    );
  }
};

@Injectable()
export class EstimateApprovalService {
  constructor(
    private readonly repository: EngineeringEstimateRepository,
    private readonly estimates: EngineeringEstimateService,
    private readonly transactions: DatabaseTransactionService,
    private readonly documents: EstimateDocumentService,
    private readonly pricing: EstimatePricingService,
    private readonly projects: ProjectService,
    private readonly customers: CustomerService,
    private readonly quotations: QuotationService,
  ) {}

  async sketch(
    request: IEstimateActor,
    input: EstimateSketchDto,
  ): Promise<Buffer> {
    const captured = await this.transactions.run(async (transaction) => {
      const record = await this.estimates.lockVersion(
        { ...request, version: input.version },
        transaction,
      );
      const saved = await this.repository.getSketch(
        record.id,
        record.version,
        transaction,
      );
      if (saved) {
        return { saved, snapshot: null, images: [] };
      }

      if (
        record.questions.some((question): boolean => question.answer === null)
      ) {
        throw new BadRequestException(
          'יש להשלים את השאלות לבירור לפני הפקת הסקיצה',
        );
      }

      const { areaIds, images } = await this.pairedSamples(
        request.id,
        input,
        record.areas,
        transaction,
      );
      const lines = await this.pricing.calculate(
        record.areas,
        record.scope,
        transaction,
      );
      requirePricedLines(lines);

      if (
        areaIds.some(
          (id): boolean => !lines.some((line): boolean => line.areaId === id),
        )
      ) {
        throw new BadRequestException(
          'לכל אזור שנבחר לסקיצה חייבות להיות שורות מתומחרות',
        );
      }

      const project = record.projectId
        ? await this.projects.quotationSnapshot(record.projectId, transaction)
        : null;
      const customer = project?.customerId
        ? await this.customers.getById(project.customerId, transaction)
        : null;
      const plans = await this.repository.plans(record.id, transaction);
      const snapshot: IEstimateReviewSnapshot = {
        name: record.name,
        areaIds,
        samples: input.samples,
        projectId: record.projectId,
        projectName: project?.name ?? null,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        lines,
        subtotal: estimateSubtotal(lines),
        rulesVersion: ENGINEERING_QUANTITY_RULES_VERSION,
        planIds: plans.map((plan): string => plan.id),
        contents: {
          areas: record.areas,
          questions: record.questions,
          scope: record.scope,
          setupStep: record.setupStep,
        },
      };
      return { saved: null, snapshot, images };
    });

    if (captured.saved) {
      return captured.saved;
    }

    const snapshot = captured.snapshot;
    if (!snapshot) {
      throw new ConflictException('לא נמצאה גרסת סקיצה');
    }

    const lines = snapshot.lines.filter((line): boolean =>
      snapshot.areaIds.includes(line.areaId),
    );
    const pdf = await this.documents.render({
      kind: ESTIMATE_DOCUMENT_KIND.SKETCH,
      version: input.version,
      snapshot: { ...snapshot, lines, subtotal: estimateSubtotal(lines) },
      markedPlans: captured.images,
    });
    await this.transactions.run(async (transaction): Promise<void> => {
      await this.estimates.lockVersion(
        { ...request, version: input.version },
        transaction,
      );
      await this.repository.addSketch(
        request.id,
        input.version,
        snapshot,
        pdf,
        transaction,
      );
    });
    return this.currentSketch(request);
  }

  async currentSketch(request: IEstimateActor): Promise<Buffer> {
    const record = await this.estimates.requireVisible(request);
    const pdf = await this.repository.getSketch(record.id, record.version);
    if (!pdf) {
      throw new NotFoundException('טרם הופקה סקיצה לגרסה הנוכחית');
    }

    return pdf;
  }

  async approve(
    request: IEstimateActor,
    version: number,
  ): Promise<IEstimateView> {
    await this.transactions.run(async (transaction): Promise<void> => {
      await this.estimates.lockVersion({ ...request, version }, transaction);
      const revision = await this.repository.revision(
        request.id,
        version,
        transaction,
      );
      if (!revision) {
        throw new ConflictException('יש להפיק סקיצה לפני האישור');
      }

      await this.repository.approve(
        request.id,
        version,
        request.actor.id,
        transaction,
      );
    });
    return this.estimates.get(request);
  }

  async createQuotation(
    request: IEstimateActor,
    input: EstimateQuotationDto,
  ): Promise<{ quotationId: string }> {
    assertPermissions(
      request.actor,
      PERMISSIONS.QUOTATIONS_CREATE,
      PERMISSIONS.QUOTATIONS_READ,
    );
    return this.transactions.run(
      async (transaction): Promise<{ quotationId: string }> => {
        const record = await this.estimates.lockVersion(
          { ...request, version: input.version },
          transaction,
        );
        const revision = await this.repository.revision(
          record.id,
          record.version,
          transaction,
        );
        if (!revision || revision.status !== ESTIMATE_STATUS.APPROVED) {
          throw new ConflictException('יש לאשר את הסקיצה לפני יצירת הצעת מחיר');
        }

        if (revision.quotationId) {
          return { quotationId: revision.quotationId };
        }

        const customerId = revision.snapshot.customerId ?? input.customerId;
        if (!customerId) {
          throw new BadRequestException('יש לבחור לקוח להצעת המחיר');
        }

        const quotationId =
          await this.quotations.createEngineeringEstimateDraft(
            {
              customerId,
              projectId: revision.snapshot.projectId,
              lines: revision.snapshot.lines,
            },
            request.actor,
            transaction,
          );
        await this.repository.linkQuotation(
          record.id,
          record.version,
          quotationId,
          transaction,
        );
        return { quotationId };
      },
    );
  }

  async proposal(request: IEstimateActor): Promise<Buffer> {
    assertPermissions(
      request.actor,
      PERMISSIONS.QUOTATIONS_EXPORT,
      PERMISSIONS.QUOTATIONS_READ,
    );
    const record = await this.estimates.requireVisible(request);
    const revision = await this.repository.revision(record.id, record.version);
    if (
      !revision?.quotationId ||
      revision.status !== ESTIMATE_STATUS.APPROVED
    ) {
      throw new ConflictException('יש ליצור הצעת מחיר מהגרסה המאושרת');
    }

    const quotation = await this.quotations.getById(revision.quotationId);
    const projectChanged = quotation.projectId !== revision.snapshot.projectId;
    const customerChanged =
      revision.snapshot.customerId !== null &&
      quotation.customerId !== revision.snapshot.customerId;
    if (projectChanged || customerChanged) {
      throw new ConflictException(
        'הלקוח או הפרויקט בהצעה השתנו. יש ליצור מהדורה חדשה של כתב הכמויות',
      );
    }

    const customer = await this.customers.getById(quotation.customerId);
    return this.documents.renderProposal(
      revision.snapshot,
      quotation,
      customer,
    );
  }

  private async pairedSamples(
    id: string,
    input: EstimateSketchDto,
    areas: IEstimateReviewSnapshot['contents']['areas'],
    transaction: Transaction,
  ): Promise<IPairedSamples> {
    const images = await Promise.all(
      input.samples.map(async ({ areaId, planId }) => {
        const area = areas.find(
          (candidate): boolean => candidate.id === areaId,
        );
        const plan = await this.repository.getPlan(id, planId, transaction);
        const image =
          plan?.mimeType === ESTIMATE_PLAN_MIME.PNG ||
          plan?.mimeType === ESTIMATE_PLAN_MIME.JPEG;
        if (!area || !plan?.marked || !image) {
          throw new BadRequestException('יש לצרף תמונה מסומנת לכל אזור בסקיצה');
        }

        return {
          areaName: area.name,
          name: plan.name,
          mimeType: plan.mimeType,
          base64: plan.content.toString('base64'),
        };
      }),
    );
    return {
      areaIds: input.samples.map((sample): string => sample.areaId),
      images,
    };
  }
}
