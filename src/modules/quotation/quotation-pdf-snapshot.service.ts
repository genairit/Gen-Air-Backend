import {
  QUOTATION_STATUS,
  QUOTATION_DECIMAL as Decimal,
} from './constants/quotation.constant';

import {
  PAYMENT_TERM_LABELS,
  QUOTATION_PDF_COMPANY,
  QUOTATION_PDF_SYSTEM_LABELS,
} from './constants/quotation-pdf.constant';

import type {
  IQuotationPdfLine,
  IQuotationPdfSection,
} from './interfaces/quotation-pdf.interface';

import {
  quotationFilename,
  quotationFilenameInputs,
} from './utilities/quotation-filename.utility';

import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { UserService } from '@Modules/user/user.service';
import defaultTerms from './constants/quotation-pdf-terms.json';
import { ProjectService } from '@Modules/project/project.service';
import { CustomerService } from '@Modules/customer/customer.service';
import { quotationView } from './utilities/quotation-calculation.utility';
import { QUOTATION_FILENAME } from './constants/quotation-filename.constant';
import type { IQuotationDocument } from './interfaces/quotation-document.interface';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { PUBLICATION_POLICY } from '@Modules/quotation-publication/constants/publication.constant';
import type { IPublicationSnapshot } from '@Modules/quotation-publication/interfaces/publication.interface';

@Injectable()
export class QuotationPdfSnapshotService {
  constructor(
    private readonly customers: CustomerService,
    private readonly projects: ProjectService,
    private readonly users: UserService,
  ) {}
  private async context(
    quotation: IQuotationDocument,
    includeCustomerDetails: boolean,
    transaction?: Transaction,
  ) {
    const [customer, project, salesAgent] = await Promise.all([
      includeCustomerDetails
        ? this.customers.getById(quotation.customerId, transaction)
        : Promise.resolve(null),
      quotation.projectId
        ? this.projects.quotationSnapshot(quotation.projectId, transaction)
        : Promise.resolve(null),
      quotation.salesAgentId
        ? this.users.findByIdIncludingDeleted(
            quotation.salesAgentId,
            transaction,
          )
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
        quotation.status === QUOTATION_STATUS.APPROVED
          ? QUOTATION_FILENAME.TITLE.ORDER
          : QUOTATION_FILENAME.TITLE.QUOTATION,
      quotationDate: new Intl.DateTimeFormat('he-IL', {
        timeZone: 'UTC',
      }).format(new Date(`${quotation.date}T00:00:00Z`)),
      printDate: new Intl.DateTimeFormat('he-IL', {
        timeZone: 'Asia/Jerusalem',
      }).format(new Date()),
      issuerName: quotation.issuerName,
      company: QUOTATION_PDF_COMPANY,
      recipient: {
        name: project?.customerName?.trim() || (customer?.name ?? ''),
        address: project?.customerAddress ?? customer?.address ?? null,
        city: project?.addressCity ?? null,
        email:
          project?.customerEmail ?? customer?.primaryContact?.email ?? null,
        phone:
          project?.customerPhone ?? customer?.primaryContact?.phone ?? null,
        customerNumber: customer?.priorityId ?? null,
      },
      project: {
        name: project?.name ?? null,
        address: project?.address ?? null,
      },
      metadata: {
        validUntil: null,
        customerTaxId: customer?.taxId ?? null,
        customerTaxLabel:
          customer?.customerType === PROJECT_DETAIL_FIELD_SETS.PRIVATE_CLIENT
            ? 'מס׳ ת״ז:'
            : 'מס׳ חברה:',
        vatFileNumber: QUOTATION_PDF_COMPANY.vatFileNumber,
        salesAgent: salesAgent
          ? `${salesAgent.firstName} ${salesAgent.lastName}`.trim()
          : null,
        revision: quotation.version,
      },
      terms: {
        ...defaultTerms,
        paymentStages: quotation.paymentSchedule.map(
          (stage): string => `${stage.percent}% — ${stage.text}`,
        ),
        payment:
          paymentTerms.length > 0
            ? [...paymentTerms, ...defaultTerms.payment.slice(1)]
            : defaultTerms.payment,
      },
    };

    return { payload, project };
  }
  async preview(
    quotation: IQuotationDocument,
    includeCustomerDetails: boolean,
    projectId: string | null,
  ) {
    const { payload } = await this.context(
      { ...quotation, projectId },
      includeCustomerDetails,
    );
    return {
      ...payload,
      defaultPayment: defaultTerms.payment,
      paymentTermLabels: PAYMENT_TERM_LABELS,
      recipientContext: {
        customerId: quotation.customerId,
        projectId: quotation.projectId,
        salesAgentId: quotation.salesAgentId,
      },
    };
  }
  async capture(
    document: IQuotationDocument,
    transaction?: Transaction,
  ): Promise<IPublicationSnapshot> {
    const { payload, project } = await this.context(
      document,
      true,
      transaction,
    );
    const quotation = quotationView(document);
    const namingInputs = quotationFilenameInputs({
      quotationId: quotation.id,
      title: payload.title,
      number: quotation.number,
      customerName: payload.recipient.name,
      projectName: project?.name ?? null,
      buildingName: project?.parentProjectId
        ? (project.parentProject?.name ?? null)
        : null,
      apartmentNumber: project?.customerApartment ?? null,
      brands: quotation.brands,
    });
    return {
      document: {
        ...payload,
        sections: quotation.sections.map((section): IQuotationPdfSection => ({
          title:
            section.title.trim() ||
            (section.brand
              ? QUOTATION_PDF_SYSTEM_LABELS[section.systemType]
              : ''),
          floorId: section.floorId ?? null,
          floorName: section.floorName ?? null,
          brand: section.brand,
          lines: section.items.map((item): IQuotationPdfLine => ({
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
      },
      source: document,
      filename: quotationFilename(namingInputs),
      namingInputs: { ...namingInputs },
      filenamePolicy: PUBLICATION_POLICY.FILENAME,
      rendererVersion: PUBLICATION_POLICY.RENDERER,
    };
  }
}
