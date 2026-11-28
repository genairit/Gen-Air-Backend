import {
  Injectable,
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { QuotationService } from './quotation.service';
import { Meta, TypedLogger } from '@Logger/logger.service';
import { hasPermission } from '@Utilities/permission.utility';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { QuotationPdfSnapshotService } from './quotation-pdf-snapshot.service';
import { PUBLICATION_LIMITS } from '@Modules/quotation-publication/constants/publication.constant';

@Injectable()
export class QuotationPdfService {
  private readonly logger = new TypedLogger<Meta>(QuotationPdfService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly quotations: QuotationService,
    private readonly snapshots: QuotationPdfSnapshotService,
  ) {}
  async preview(
    id: string,
    actor: IAuthorizedUser,
  ): ReturnType<QuotationPdfSnapshotService['preview']> {
    const quotation = await this.quotations.getForActor(id, actor);
    const mayReadProjects = hasPermission(actor, PERMISSIONS.PROJECTS_READ);
    const mayReadCustomer =
      hasPermission(actor, PERMISSIONS.CUSTOMERS_READ) ||
      (mayReadProjects && hasPermission(actor, PERMISSIONS.QUOTATIONS_EXPORT));
    return this.snapshots.preview(
      quotation,
      mayReadCustomer,
      mayReadProjects ? quotation.projectId : null,
    );
  }
  async export(id: string): Promise<{ filename: string; pdf: Buffer }> {
    const snapshot = await this.snapshots.capture(
      await this.quotations.document(id),
    );
    const payload = snapshot.document;
    const url = this.config.get<string>('WORKER_URL');
    const token = this.config.get<string>('WORKER_API_TOKEN');
    if (!url || !token) {
      throw new ServiceUnavailableException(
        'Quotation PDF worker is not configured',
      );
    }

    const response = await fetch(new URL('/render/quotation-pdf', url), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PUBLICATION_LIMITS.HTTP_TIMEOUT_MS),
    }).catch((error: unknown): never => {
      this.logger.error({
        message: 'Quotation PDF worker transport failed',
        error,
      });
      throw new ServiceUnavailableException(
        'Quotation PDF worker is unavailable',
      );
    });
    if (
      !response.ok ||
      response.headers
        .get('content-type')
        ?.includes(GOOGLE_DRIVE.PDF_MIME_TYPE) !== true
    ) {
      throw new BadGatewayException('Quotation PDF worker failed');
    }

    const pdf = Buffer.from(await response.arrayBuffer());
    const boundedPdf =
      pdf.length >= 8 && pdf.length <= PUBLICATION_LIMITS.PDF_BYTES;
    const pdfSignature = pdf.subarray(0, 5).toString() === '%PDF-';
    if (!boundedPdf || !pdfSignature) {
      throw new BadGatewayException(
        'Quotation PDF worker returned an invalid file',
      );
    }

    return { filename: snapshot.filename, pdf };
  }
}
