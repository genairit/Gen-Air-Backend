import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  SaveQuotationDto,
  CreateQuotationDto,
  QuotationTransitionDto,
  AcknowledgeWarningsDto,
} from './dto/save-quotation.dto';

import {
  decodeQuotationCursor,
  encodeQuotationCursor,
} from './utilities/quotation-cursor.utility';

import {
  quotationView,
  quotationWarnings,
} from './utilities/quotation-calculation.utility';

import type {
  IQuotationView,
  IQuotationDocument,
} from './interfaces/quotation-document.interface';

import Decimal from 'decimal.js';
import { Transaction } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { QuotationRepository } from './quotation.repository';
import type { GetQuotationsDto } from './dto/get-quotations.dto';
import { DEFAULT_VAT_RATE } from './constants/quotation.constant';
import { ProjectService } from '@Modules/project/project.service';
import { CustomerService } from '@Modules/customer/customer.service';
import { QuotationSelectionService } from './quotation-selection.service';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';

@Injectable()
export class QuotationService {
  constructor(
    private readonly repository: QuotationRepository,
    private readonly rules: QuotationRuleService,
    private readonly sections: QuotationSectionService,
    private readonly items: QuotationItemService,
    private readonly catalogue: CatalogueItemService,
    private readonly selection: QuotationSelectionService,
    private readonly customers: CustomerService,
    private readonly projects: ProjectService,
    private readonly transactions: DatabaseTransactionService,
  ) {}
  async list(query: GetQuotationsDto): Promise<{
    items: IQuotationView[];
    nextCursor: string | null;
  }> {
    const cursor = decodeQuotationCursor(query);
    return this.transactions.readSnapshot(async (transaction) => {
      const rows = await this.repository.list(query, cursor, transaction);
      const page = rows.slice(0, query.batchSize ?? 20);
      const sections = await this.sections.list(
        page.map((row) => row.id),
        transaction,
      );
      const items = await this.items.list(
        sections.map((section) => section.id),
        transaction,
      );
      const configuration = await this.rules.configuration(transaction);
      const catalogue = await this.catalogue.getByIds(
        items.map((item) => item.catalogueItemId),
        transaction,
      );
      const statuses = new Map(catalogue.map((item) => [item.id, item.status]));
      const documents = page.map((row) => ({
        ...row.toJSON(),
        customerName: row.customerName,
        projectName: row.projectName,
        sections: sections
          .filter((section) => section.quotationId === row.id)
          .map((section) => ({
            ...section.toJSON(),
            items: items
              .filter((item) => item.sectionId === section.id)
              .map((item) => item.toJSON()),
          })),
      }));
      const views: IQuotationView[] = [];
      for (const document of documents) {
        const current =
          document.status === QUOTATION_STATUS.APPROVED
            ? document
            : this.overlayCatalogueStatuses(document, statuses);
        const rules =
          document.status === QUOTATION_STATUS.APPROVED
            ? {
                rules: document.ruleConfiguration,
                fingerprint: document.ruleConfigFingerprint,
              }
            : configuration;
        views.push(
          quotationView({
            ...current,
            ruleConfiguration: rules.rules,
            ruleConfigFingerprint: rules.fingerprint,
            acknowledgedWarnings:
              rules.fingerprint === document.ruleConfigFingerprint
                ? document.acknowledgedWarnings
                : [],
          }),
        );
      }
      const last = page.at(-1);
      const nextCursor =
        rows.length > page.length && last
          ? encodeQuotationCursor({
              id: last.id,
              updatedAt: last.updatedAt.toISOString(),
              search: (query.search ?? '').trim(),
              status: query.status ?? null,
            })
          : null;
      return { items: views, nextCursor };
    });
  }
  async document(
    id: string,
    transaction?: Transaction,
  ): Promise<IQuotationDocument> {
    const quotation = await this.repository.findById(id, transaction);
    if (!quotation) {
      throw new NotFoundException('הצעת המחיר לא נמצאה');
    }
    const sections = await this.sections.list([id], transaction);
    const items = await this.items.list(
      sections.map((section) => section.id),
      transaction,
    );
    return {
      ...quotation.toJSON(),
      sections: sections.map((section) => ({
        ...section.toJSON(),
        items: items
          .filter((item) => item.sectionId === section.id)
          .map((item) => item.toJSON()),
      })),
    };
  }
  async getById(id: string): Promise<IQuotationView> {
    return this.transactions.run(async (transaction) => {
      const quotation = await this.document(id, transaction);
      const configuration =
        quotation.status === QUOTATION_STATUS.APPROVED
          ? {
              rules: quotation.ruleConfiguration,
              fingerprint: quotation.ruleConfigFingerprint,
            }
          : await this.rules.configuration(transaction);
      const current =
        quotation.status === QUOTATION_STATUS.APPROVED
          ? quotation
          : await this.currentCatalogueState(quotation, transaction);
      return quotationView({
        ...current,
        ruleConfiguration: configuration.rules,
        ruleConfigFingerprint: configuration.fingerprint,
        acknowledgedWarnings:
          configuration.fingerprint === quotation.ruleConfigFingerprint
            ? quotation.acknowledgedWarnings
            : [],
      });
    });
  }
  async create(
    input: CreateQuotationDto,
    userId: string,
  ): Promise<IQuotationView> {
    const customer = await this.customers.getById(input.customerId);
    await this.validateProject(input.customerId, input.projectId ?? null);
    const id = randomUUID();
    await this.transactions.run(async (transaction) => {
      const configuration = await this.rules.configuration(transaction);
      const date = new Date().toISOString().slice(0, 10);
      const prefix = date.slice(2, 7).replace('-', '');
      await this.transactions.lockKey(
        `quotation-number:${prefix}`,
        transaction,
      );
      await this.repository.create(
        {
          id,
          ruleConfiguration: configuration.rules,
          ruleConfigFingerprint: configuration.fingerprint,
          number: await this.repository.nextNumber(prefix, transaction),
          customerId: customer.id,
          projectId: input.projectId ?? null,
          status: QUOTATION_STATUS.DRAFT,
          date,
          brand: '',
          paymentTerms: customer.paymentTerms ?? null,
          paymentTermsNote: '',
          paymentSchedule: [],
          discountPercent: '0',
          targetPretaxAmount: null,
          vatRate: DEFAULT_VAT_RATE,
          internalNotes: '',
          version: 1,
          acknowledgedWarnings: [],
          createdById: userId,
          updatedById: userId,
          approvedById: null,
          approvedAt: null,
        },
        transaction,
      );
    });
    return this.getById(id);
  }
  async save(
    id: string,
    input: SaveQuotationDto,
    userId: string,
  ): Promise<IQuotationView> {
    await this.customers.getById(input.customerId);
    await this.validateProject(input.customerId, input.projectId);
    await this.transactions.run(async (transaction) => {
      const current = await this.document(id, transaction);
      this.assertVersion(current, input.version);
      if (current.status === QUOTATION_STATUS.APPROVED) {
        throw new ConflictException('יש לפתוח את ההצעה לעריכה לפני שינוי');
      }
      if (new Decimal(input.discountPercent).gt(100)) {
        throw new BadRequestException('אחוז ההנחה חייב להיות עד100');
      }
      const configuration = await this.rules.configuration(transaction);
      const sections = input.sections;
      const snapshots = await this.selection.snapshots({
        current,
        input,
        userId,
        transaction,
      });
      const oldIds = current.sections.map((section) => section.id);
      await this.items.remove(oldIds, transaction);
      await this.sections.remove([id], transaction);
      await this.sections.insert(
        sections.map((section, displayOrder) => ({
          id: section.id,
          quotationId: id,
          title: section.title,
          systemType: section.systemType,
          displayOrder,
        })),
        transaction,
      );
      await this.items.insert(snapshots, transaction);
      const { sections: ignored, version, ...attributes } = input;
      void ignored;
      await this.repository.update(
        id,
        {
          ...attributes,
          ruleConfiguration: configuration.rules,
          ruleConfigFingerprint: configuration.fingerprint,
          version: version + 1,
          status: QUOTATION_STATUS.DRAFT,
          acknowledgedWarnings: [],
          approvedAt: null,
          approvedById: null,
          updatedById: userId,
        },
        transaction,
      );
    });
    return this.getById(id);
  }
  async transition(
    id: string,
    input: QuotationTransitionDto,
    userId: string,
  ): Promise<IQuotationView> {
    await this.transactions.run(async (transaction) => {
      const current = await this.document(id, transaction);
      this.assertVersion(current, input.version);
      const configuration = await this.rules.configuration(transaction);
      const checked = {
        ...(await this.currentCatalogueState(current, transaction)),
        ruleConfiguration: configuration.rules,
        acknowledgedWarnings:
          configuration.fingerprint === current.ruleConfigFingerprint
            ? current.acknowledgedWarnings
            : [],
      };
      const allowed: Record<string, string[]> = {
        draft: [QUOTATION_STATUS.REVIEW],
        review: [QUOTATION_STATUS.DRAFT, QUOTATION_STATUS.APPROVED],
        approved: [QUOTATION_STATUS.DRAFT],
      };
      if (!allowed[current.status].includes(input.status)) {
        throw new ConflictException('מעבר הסטטוס אינו תקין');
      }
      if (
        input.status === QUOTATION_STATUS.REVIEW &&
        (!current.brand ||
          !current.sections.some((section) => section.items.length))
      ) {
        throw new BadRequestException(
          'יש לבחור חברה ולהוסיף פריטים לפני בדיקה',
        );
      }
      if (
        input.status === QUOTATION_STATUS.APPROVED &&
        quotationWarnings(checked).some((warning) => !warning.acknowledged)
      ) {
        throw new ConflictException('יש לטפל בכל ההתראות או לאשר אותן');
      }
      const approved = input.status === QUOTATION_STATUS.APPROVED;
      if (approved) {
        await this.items.persistCatalogueStatuses(
          checked.sections.flatMap((section) => section.items),
          transaction,
        );
      }
      await this.repository.update(
        id,
        {
          status: input.status,
          ruleConfiguration: configuration.rules,
          ruleConfigFingerprint: configuration.fingerprint,
          acknowledgedWarnings: checked.acknowledgedWarnings,
          version: current.version + 1,
          updatedById: userId,
          approvedById: approved ? userId : null,
          approvedAt: approved ? new Date() : null,
        },
        transaction,
      );
    });
    return this.getById(id);
  }
  async acknowledge(
    id: string,
    input: AcknowledgeWarningsDto,
    userId: string,
  ): Promise<IQuotationView> {
    await this.transactions.run(async (transaction) => {
      const current = await this.document(id, transaction);
      this.assertVersion(current, input.version);
      if (current.status === QUOTATION_STATUS.APPROVED) {
        throw new ConflictException('הצעה מאושרת נעולה');
      }
      const configuration = await this.rules.configuration(transaction);
      const checked = {
        ...(await this.currentCatalogueState(current, transaction)),
        ruleConfiguration: configuration.rules,
      };
      const valid = new Set(
        quotationWarnings(checked).map((warning) => warning.key),
      );
      if (input.warningKeys.some((key) => !valid.has(key))) {
        throw new BadRequestException('התראה לא תקפה; יש לרענן את ההצעה');
      }
      await this.repository.update(
        id,
        {
          ruleConfiguration: configuration.rules,
          ruleConfigFingerprint: configuration.fingerprint,
          acknowledgedWarnings: [...new Set(input.warningKeys)],
          version: current.version + 1,
          updatedById: userId,
        },
        transaction,
      );
    });
    return this.getById(id);
  }
  private async currentCatalogueState(
    quotation: IQuotationDocument,
    transaction: Transaction,
  ): Promise<IQuotationDocument> {
    const rows = await this.catalogue.getByIds(
      quotation.sections.flatMap((section) =>
        section.items.map((item) => item.catalogueItemId),
      ),
      transaction,
    );
    const statuses = new Map(rows.map((item) => [item.id, item.status]));
    return this.overlayCatalogueStatuses(quotation, statuses);
  }
  private overlayCatalogueStatuses(
    quotation: IQuotationDocument,
    statuses: Map<string, string>,
  ): IQuotationDocument {
    return {
      ...quotation,
      sections: quotation.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({
          ...item,
          catalogueStatus:
            statuses.get(item.catalogueItemId) ?? item.catalogueStatus,
        })),
      })),
    };
  }
  private assertVersion(current: IQuotationDocument, version: number): void {
    if (current.version !== version) {
      throw new ConflictException('ההצעה עודכנה במקביל. יש לרענן לפני שמירה');
    }
  }
  private async validateProject(
    customerId: string,
    projectId: string | null,
  ): Promise<void> {
    if (!projectId) {
      return;
    }
    const project = await this.projects.getById(projectId);
    if (project.customerId !== customerId) {
      throw new BadRequestException('הפרויקט אינו משויך ללקוח שנבחר');
    }
  }
}
