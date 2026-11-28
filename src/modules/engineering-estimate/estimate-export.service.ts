import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import {
  estimateSubtotal,
  EstimatePricingService,
} from './estimate-pricing.service';

import type {
  IEstimateExport,
  IEstimateReviewSnapshot,
} from './interfaces/engineering-estimate.interface';

import { ProjectService } from '@Modules/project/project.service';
import { buildDriveFileUrl } from '@Utilities/google-drive.utility';
import { CustomerService } from '@Modules/customer/customer.service';
import { EstimateDocumentService } from './estimate-document.service';
import { ENGINEERING_QUANTITY_RULES_VERSION } from './quantity-rules';
import { EngineeringEstimateService } from './engineering-estimate.service';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { ESTIMATE_DOCUMENT_KIND } from './constants/engineering-estimate.constant';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

interface IEstimateActor {
  id: string;
  actor: IAuthorizedUser;
}

// eslint-disable-next-line no-control-regex
const FORBIDDEN_FILE_NAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f]/g;

const exportFileName = (name: string, version: number): string => {
  const safeName = name
    .replace(FORBIDDEN_FILE_NAME_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${safeName || 'כתב כמויות'} - כתב כמויות - גרסה ${version}.pdf`;
};

@Injectable()
export class EstimateExportService {
  constructor(
    private readonly estimates: EngineeringEstimateService,
    private readonly pricing: EstimatePricingService,
    private readonly projects: ProjectService,
    private readonly customers: CustomerService,
    private readonly documents: EstimateDocumentService,
    private readonly projectDrive: ProjectDriveService,
    private readonly transactions: DatabaseTransactionService,
  ) {}

  async exportToDrive(
    request: IEstimateActor,
    version: number,
  ): Promise<IEstimateExport> {
    const snapshot = await this.transactions.run(
      async (transaction): Promise<IEstimateReviewSnapshot> => {
        const record = await this.estimates.lockVersion(
          { ...request, version },
          transaction,
        );
        if (!record.projectId) {
          throw new ConflictException(
            'יש לשייך את כתב הכמויות לפרויקט לפני הייצוא ל-Drive',
          );
        }

        const lines = await this.pricing.calculate(
          record.areas,
          record.scope,
          transaction,
        );
        const hasMissingPrice = lines.some(
          (line): boolean => line.unitPrice === null || line.total === null,
        );
        if (lines.length === 0 || hasMissingPrice) {
          throw new BadRequestException(
            'יש להוסיף שורות ולהשלים את כל המחירים לפני הייצוא',
          );
        }

        const project = await this.projects.quotationSnapshot(
          record.projectId,
          transaction,
        );
        const customer = project.customerId
          ? await this.customers.getById(project.customerId, transaction)
          : null;
        return {
          name: record.name,
          areaIds: record.areas.map((area): string => area.id),
          samples: [],
          planIds: [],
          projectId: record.projectId,
          projectName: project.name,
          customerId: customer?.id ?? null,
          customerName: customer?.name ?? null,
          lines,
          subtotal: estimateSubtotal(lines),
          rulesVersion: ENGINEERING_QUANTITY_RULES_VERSION,
          contents: {
            areas: record.areas,
            questions: record.questions,
            scope: record.scope,
            setupStep: record.setupStep,
          },
        };
      },
    );
    const projectId = snapshot.projectId;
    if (!projectId) {
      throw new ConflictException('כתב הכמויות אינו משויך לפרויקט');
    }

    const pdf = await this.documents.render({
      version,
      snapshot,
      markedPlans: [],
      kind: ESTIMATE_DOCUMENT_KIND.BOQ,
    });
    const fileName = exportFileName(snapshot.name, version);
    const file = await this.projectDrive.uploadBoqPdf(projectId, fileName, pdf);
    return {
      fileName,
      fileUrl: file.webViewLink ?? buildDriveFileUrl(file.id),
    };
  }
}
