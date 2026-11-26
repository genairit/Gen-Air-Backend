import {
  Injectable,
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  ESTIMATE_SCOPE,
  ESTIMATE_PLAN_MIME,
  ESTIMATE_DOCUMENT_KIND,
} from './constants/engineering-estimate.constant';

import {
  DEFAULT_VAT_RATE,
  QUOTATION_DECIMAL as Decimal,
} from '@Modules/quotation/constants/quotation.constant';

import { ConfigService } from '@nestjs/config';
import { TIME_UNITS } from '@Constants/time.constant';
import { ConflictException, Logger } from '@nestjs/common';
import type { ICustomer } from '@Modules/customer/interfaces/customer.interface';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import { PAYMENT_TERM_LABELS } from '@Modules/quotation/constants/quotation-pdf.constant';
import type { IEstimateReviewSnapshot } from './interfaces/engineering-estimate.interface';
import type { IQuotationDetailView } from '@Modules/quotation/interfaces/quotation-document.interface';

interface IMarkedPlan {
  name: string;
  base64: string;
  areaName: string;
  mimeType: string;
}

interface IEstimateCommercial {
  date: string;
  paymentTerms: string[];
  contactName: string | null;
  contactPhone: string | null;
  totals: IQuotationDetailView['totals'];
}

interface IEstimateRender {
  version: number;
  markedPlans: IMarkedPlan[];
  commercial?: IEstimateCommercial;
  snapshot: IEstimateReviewSnapshot;
  kind: (typeof ESTIMATE_DOCUMENT_KIND)[keyof typeof ESTIMATE_DOCUMENT_KIND];
}

const RENDER_TIMEOUT = 40 * TIME_UNITS.SECOND_MS;
const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_LABEL_LENGTH = 500;
const MAX_TERM_LENGTH = 1200;
const SCOPE_LABEL = {
  [ESTIMATE_SCOPE.HVAC]: 'מיזוג בלבד',
  [ESTIMATE_SCOPE.VENTILATION]: 'מיזוג ואוורור',
  [ESTIMATE_SCOPE.INSTALLATION]: 'התקנה בלבד',
  [ESTIMATE_SCOPE.FLOOR_HEATING]: 'מיזוג וחימום תת־רצפתי',
} as const;

const splitLabel = (text: string): string[] => {
  const chunks = Array.from(text);
  return Array.from(
    { length: Math.ceil(chunks.length / MAX_TERM_LENGTH) },
    (_, index): string =>
      chunks
        .slice(index * MAX_TERM_LENGTH, (index + 1) * MAX_TERM_LENGTH)
        .join(''),
  );
};

@Injectable()
export class EstimateDocumentService {
  private readonly logger = new Logger(EstimateDocumentService.name);
  constructor(private readonly config: ConfigService) {}

  async renderProposal(
    snapshot: IEstimateReviewSnapshot,
    quotation: IQuotationDetailView,
    customer: ICustomer,
  ): Promise<Buffer> {
    if (quotation.status !== QUOTATION_STATUS.APPROVED) {
      throw new ConflictException(
        'יש לאשר את הצעת המחיר לפני הפקת המסמך ללקוח',
      );
    }

    const lines = quotation.sections.flatMap((section) =>
      section.items.map((item) => ({
        areaId: section.id,
        areaName: section.title.trim() || snapshot.name,
        sku: item.sku,
        description: item.description.trim() || item.sku,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.quotedPrice,
        total: new Decimal(item.quantity).times(item.quotedPrice).toFixed(2),
        catalogueItemId: item.catalogueItemId,
        source: 'manual' as const,
        provenance: null,
      })),
    );
    const paymentTerms = [
      ...(quotation.paymentTerms
        ? [PAYMENT_TERM_LABELS[quotation.paymentTerms]]
        : []),
      ...quotation.paymentSchedule.map(
        (stage): string => `${stage.percent}% — ${stage.text}`,
      ),
      ...(quotation.paymentTermsNote ? [quotation.paymentTermsNote] : []),
    ];
    return this.render({
      kind: ESTIMATE_DOCUMENT_KIND.PROPOSAL,
      version: quotation.version,
      snapshot: {
        ...snapshot,
        lines,
        customerName: customer.name,
        subtotal: quotation.totals.subtotal,
      },
      markedPlans: [],
      commercial: {
        totals: quotation.totals,
        date: quotation.date,
        contactName: customer.primaryContact?.name ?? customer.contactName,
        contactPhone: customer.primaryContact?.phone ?? customer.phone,
        paymentTerms,
      },
    });
  }

  async render({
    kind,
    version,
    snapshot,
    markedPlans,
    commercial,
  }: IEstimateRender): Promise<Buffer> {
    const url = this.config.get<string>('WORKER_URL');
    const token = this.config.get<string>('WORKER_API_TOKEN');
    if (!url || !token) {
      throw new ServiceUnavailableException('שירות הפקת המסמכים אינו זמין');
    }

    const subtotal = new Decimal(snapshot.subtotal);
    const vat = subtotal.times(DEFAULT_VAT_RATE).div(100).toDecimalPlaces(2);
    const lines = snapshot.lines.map(
      ({ areaName, sku, description, unit, quantity, unitPrice, total }) => {
        if (unitPrice === null || total === null) {
          throw new ConflictException('לא ניתן להפיק מסמך עם מחיר חסר');
        }

        return {
          areaName,
          sku,
          description: description.slice(0, MAX_LABEL_LENGTH),
          unit,
          quantity,
          unitPrice,
          total,
        };
      },
    );
    const response = await fetch(
      new URL('/render/engineering-estimate-pdf', url),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          kind,
          name: snapshot.name,
          projectName: snapshot.projectName,
          customerName: snapshot.customerName,
          scopeLabel: SCOPE_LABEL[snapshot.contents.scope],
          revision: version,
          subtotal: subtotal.toFixed(2),
          vat: commercial?.totals.vat ?? vat.toFixed(2),
          total: commercial?.totals.total ?? subtotal.plus(vat).toFixed(2),
          ...(commercial
            ? {
                adjustment: commercial.totals.discount,
                documentDate: commercial.date,
                contactName: commercial.contactName,
                contactPhone: commercial.contactPhone,
                paymentTerms: commercial.paymentTerms.flatMap(
                  (text): string[] => splitLabel(text),
                ),
              }
            : {}),
          lines,
          markedPlans,
        }),
        signal: AbortSignal.timeout(RENDER_TIMEOUT),
      },
    ).catch((error: unknown): never => {
      this.logger.warn(
        error instanceof Error
          ? error.name
          : 'Estimate document transport failed',
      );
      throw new ServiceUnavailableException('שירות הפקת המסמכים אינו זמין');
    });
    if (
      !response.ok ||
      !response.headers.get('content-type')?.includes(ESTIMATE_PLAN_MIME.PDF)
    ) {
      throw new BadGatewayException('לא ניתן להפיק את המסמך');
    }

    const pdf = Buffer.from(await response.arrayBuffer());
    if (
      pdf.length > MAX_PDF_BYTES ||
      pdf.subarray(0, 5).toString() !== '%PDF-'
    ) {
      throw new BadGatewayException('התקבל מסמך לא תקין');
    }

    return pdf;
  }
}
