import {
  Injectable,
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  QUOTATION_STATUS,
  QUOTATION_DECIMAL as Decimal,
} from './constants/quotation.constant';

import {
  PAYMENT_TERM_LABELS,
  QUOTATION_PDF_COMPANY,
} from './constants/quotation-pdf.constant';

import { ConfigService } from '@nestjs/config';
import { QuotationService } from './quotation.service';
import { UserService } from '@Modules/user/user.service';
import { Meta, TypedLogger } from '@Logger/logger.service';
import defaultTerms from './constants/quotation-pdf-terms.json';
import { ProjectService } from '@Modules/project/project.service';
import { CustomerService } from '@Modules/customer/customer.service';
import { quotationView } from './utilities/quotation-calculation.utility';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';

@Injectable()
export class QuotationPdfService {
  private readonly logger = new TypedLogger<Meta>(QuotationPdfService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly quotations: QuotationService,
    private readonly customers: CustomerService,
    private readonly projects: ProjectService,
    private readonly users: UserService,
    private readonly drive: ProjectDriveService,
  ) {}

  async export(id: string): Promise<{ filename: string; pdf: Buffer }> {
    const quotation = quotationView(await this.quotations.document(id));
    const [customer, project, salesAgent] = await Promise.all([
      this.customers.getById(quotation.customerId),
      quotation.projectId
        ? this.projects.getById(quotation.projectId)
        : Promise.resolve(null),
      quotation.salesAgentId
        ? this.users.findByIdIncludingDeleted(quotation.salesAgentId)
        : Promise.resolve(null),
    ]);
    const paymentTerms = [
      ...(quotation.paymentTerms
        ? [PAYMENT_TERM_LABELS[quotation.paymentTerms]]
        : []),
      ...(quotation.paymentTermsNote ? [quotation.paymentTermsNote] : []),
    ];

    const payload = {
      number: quotation.number,
      title:
        quotation.status === QUOTATION_STATUS.APPROVED ? 'הזמנה' : 'הצעת מחיר',
      quotationDate: new Intl.DateTimeFormat('he-IL', {
        timeZone: 'UTC',
      }).format(new Date(`${quotation.date}T00:00:00Z`)),
      printDate: new Intl.DateTimeFormat('he-IL', {
        timeZone: 'Asia/Jerusalem',
      }).format(new Date()),
      issuerName: quotation.issuerName,
      company: QUOTATION_PDF_COMPANY,
      recipient: {
        name: project?.customerName ?? customer.name,
        address: project?.customerAddress ?? customer.address,
        city: project?.addressCity ?? null,
        email: project?.customerEmail ?? customer.primaryContact?.email ?? null,
        phone: project?.customerPhone ?? customer.primaryContact?.phone ?? null,
        customerNumber: customer.priorityId,
      },
      project: {
        name: project?.name ?? null,
        address: project?.address ?? null,
      },
      metadata: {
        validUntil: null,
        customerTaxId: customer.taxId,
        customerTaxLabel:
          customer.customerType === PROJECT_DETAIL_FIELD_SETS.PRIVATE_CLIENT
            ? 'מס׳ ת״ז:'
            : 'מס׳ חברה:',
        vatFileNumber: QUOTATION_PDF_COMPANY.vatFileNumber,
        salesAgent: salesAgent
          ? `${salesAgent.firstName} ${salesAgent.lastName}`.trim()
          : null,
        revision: quotation.version,
      },
      sections: quotation.sections.map((section) => ({
        title: section.title,
        brand: section.brand,
        lines: section.items.map((item) => ({
          sku: item.sku,
          unit: item.unit,
          quantity: item.quantity,
          description: item.description,
          unitPrice: item.quotedPrice,
          totalPrice: new Decimal(item.quantity)
            .times(item.quotedPrice)
            .toFixed(2),
          capacityBtu: item.capacityBtu,
        })),
      })),
      totals: {
        subtotal: quotation.totals.subtotal,
        discount: quotation.totals.discount,
        pretax: quotation.totals.pretax,
        vatRate: quotation.vatRate,
        vat: quotation.totals.vat,
        total: quotation.totals.total,
      },
      terms: {
        ...defaultTerms,
        paymentStages: quotation.paymentSchedule.map(
          (stage) => `${stage.percent}% — ${stage.text}`,
        ),
        payment:
          paymentTerms.length > 0
            ? [...paymentTerms, ...defaultTerms.payment.slice(1)]
            : defaultTerms.payment,
      },
    };

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
      signal: AbortSignal.timeout(110_000),
    }).catch((error: unknown) => {
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
      response.headers.get('content-type')?.includes('application/pdf') !== true
    ) {
      throw new BadGatewayException('Quotation PDF worker failed');
    }

    const pdf = Buffer.from(await response.arrayBuffer());
    if (pdf.length < 8 || pdf.subarray(0, 5).toString() !== '%PDF-') {
      throw new BadGatewayException(
        'Quotation PDF worker returned an invalid file',
      );
    }

    const filename = `${payload.title} ${quotation.number}.pdf`;
    if (project) {
      await this.drive.uploadQuotationPdf(project.id, filename, pdf);
    }

    return { filename, pdf };
  }
}
