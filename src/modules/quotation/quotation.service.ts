import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  SaveQuotationDto,
  CreateQuotationDto,
  CancelQuotationDto,
  UpdateSalesAgentDto,
  QuotationTransitionDto,
  AcknowledgeWarningsDto,
  QuotationCancellationDto,
} from './dto/save-quotation.dto';

import {
  hasPermission,
  assertPermissions,
} from '@Utilities/permission.utility';

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
  IQuotationDetailView,
  IProjectQuotationView,
  IQuotationApartmentOptions,
} from './interfaces/quotation-document.interface';

import {
  quotationActorName,
  appendQuotationCancellation,
  hasApprovedQuotationSnapshot,
  restoreQuotationCancellation,
} from './utilities/quotation-cancellation.utility';

import {
  QUOTATION_STATUS,
  WARNING_SCOPE_VERSION,
  type TQuotationStatus,
  QUOTATION_CANCELLATION_KIND,
  type TQuotationCancellationKind,
  MAX_QUOTATION_CANCELLATION_REASON_LENGTH,
} from '@Modules/quotation/constants/quotation.constant';

import {
  sortApartments,
  toQuotationApartment,
} from '@Modules/quotation-project/utilities/quotation-apartment.utility';

import Decimal from 'decimal.js';
import { Transaction } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { Quotation } from './entities/quotation.entity';
import { UserService } from '@Modules/user/user.service';
import { USER_ROLES } from '@Constants/user-role.constant';
import { QuotationRepository } from './quotation.repository';
import { PERMISSIONS } from '@Constants/authorization.constant';
import type { GetQuotationsDto } from './dto/get-quotations.dto';
import { DEFAULT_VAT_RATE } from './constants/quotation.constant';
import { ProjectService } from '@Modules/project/project.service';
import type { IQuotation } from './interfaces/quotation.interface';
import type { DeleteQuotationDto } from './dto/delete-quotation.dto';
import { CustomerService } from '@Modules/customer/customer.service';
import type { IUser } from '@Modules/user/interfaces/user.interface';
import { UserRoleService } from '@Modules/user-role/user-role.service';
import type { SetApartmentLinksDto } from './dto/set-apartment-links.dto';
import { QuotationSelectionService } from './quotation-selection.service';
import type { GetQuotationCountsDto } from './dto/get-quotation-counts.dto';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import type { IQuotationSalesAgent } from './interfaces/quotation.interface';
import { toProjectQuotationView } from './utilities/quotation-sharing.utility';
import { quotationPaymentIssues } from './utilities/quotation-payment.utility';
import type { GetProjectQuotationsDto } from './dto/get-project-quotations.dto';
import { resolveQuotationBrandGroups } from './utilities/quotation-brand.utility';
import { salesAgentDisplayName } from './utilities/quotation-sales-agent.utility';
import { QUOTATION_SHARING_MESSAGES } from './constants/quotation-sharing.constant';
import { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import type { IQuotationStatusCounts } from './interfaces/quotation-status-counts.interface';
import { CUSTOMER_PROJECT_KINDS } from '@Modules/project/constants/customer-project.constant';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { QuotationProjectService } from '@Modules/quotation-project/quotation-project.service';
import { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';
import { validateRuleConfiguration } from '@Modules/quotation-rule/utilities/quotation-rule.utility';
import type { IQuotationPrimaryProject } from '@Modules/quotation-project/interfaces/quotation-project.interface';

type TQuotationCancellationRecord = Pick<
  IQuotation,
  'id' | 'version' | 'status' | 'cancellationHistory'
>;

interface ICancelQuotationInput {
  reason: string;
  actorId: string;
  actorName: string;
  cancelledAt: string;
  transaction: Transaction;
  kind: TQuotationCancellationKind;
  quotation: TQuotationCancellationRecord;
}

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
    private readonly links: QuotationProjectService,
    private readonly transactions: DatabaseTransactionService,
    private readonly users: UserService,
    private readonly userRoles: UserRoleService,
  ) {}
  statusCounts(query: GetQuotationCountsDto): Promise<IQuotationStatusCounts> {
    return this.repository.statusCounts(query.search ?? '');
  }
  async salesAgents(): Promise<IQuotationSalesAgent[]> {
    const eligibleUserIds = await this.userRoles.findUserIdsByRole(
      USER_ROLES.SALES_AGENT,
    );
    const eligibleUsers = await this.users.findByIds(eligibleUserIds);

    return eligibleUsers.map(({ id, firstName, lastName, employeeNumber }) => ({
      id,
      firstName,
      lastName,
      employeeNumber,
    }));
  }
  async list(query: GetQuotationsDto): Promise<{
    items: IQuotationView[];
    nextCursor: string | null;
  }> {
    const cursor = decodeQuotationCursor(query);
    return this.transactions.readSnapshot(async (transaction) => {
      const rows = await this.repository.list(
        { ...query, projectId: null },
        cursor,
        transaction,
      );
      return this.toPage(rows, query, transaction);
    });
  }
  async listByProject(
    projectId: string,
    query: GetProjectQuotationsDto,
  ): Promise<{
    total: number;
    nextCursor: string | null;
    items: IProjectQuotationView[];
  }> {
    await this.projects.getById(projectId);
    const cursor = decodeQuotationCursor(query);
    return this.transactions.readSnapshot(async (transaction) => {
      const rows = await this.repository.list(
        { batchSize: query.batchSize, projectId },
        cursor,
        transaction,
      );
      const total = await this.repository.countByProject(
        projectId,
        transaction,
      );
      const page = await this.toPage(rows, query, transaction);
      const ids = page.items.map((view) => view.id);
      const primaryProjects = await this.links.primaryProjects(
        ids,
        transaction,
      );
      const apartmentLinks = await this.links.apartmentLinks(ids, transaction);
      const items = page.items.map((view) =>
        toProjectQuotationView({
          view,
          projectId,
          primaryProject: primaryProjects.get(view.id) ?? null,
          apartmentLinks: apartmentLinks.get(view.id) ?? [],
        }),
      );
      return { items, total, nextCursor: page.nextCursor };
    });
  }
  async document(
    id: string,
    transaction?: Transaction,
  ): Promise<IQuotationDocument> {
    const quotation = await this.requireQuotation(id, transaction);
    const primaryProject = await this.links.primaryProject(id, transaction);
    const sections = await this.sections.list([id], transaction);
    const items = await this.items.list(
      sections.map((section) => section.id),
      transaction,
    );
    return {
      ...quotation.toJSON(),
      projectId: primaryProject?.id ?? null,
      ruleConfigFingerprint: validateRuleConfiguration(
        quotation.ruleConfiguration,
      ).fingerprint,
      sections: sections.map((section) => ({
        ...section.toJSON(),
        items: items
          .filter((item) => item.sectionId === section.id)
          .map((item) => item.toJSON()),
      })),
    };
  }
  async getById(id: string): Promise<IQuotationDetailView> {
    return this.transactions.run(async (transaction) => {
      const quotation = await this.document(id, transaction);
      const salesAgent = quotation.salesAgentId
        ? await this.users.findByIdIncludingDeleted(
            quotation.salesAgentId,
            transaction,
          )
        : null;
      const configuration = hasApprovedQuotationSnapshot(quotation)
        ? {
            rules: quotation.ruleConfiguration,
            fingerprint: quotation.ruleConfigFingerprint,
          }
        : await this.rules.configuration(transaction);
      const current = hasApprovedQuotationSnapshot(quotation)
        ? quotation
        : await this.currentCatalogueState(quotation, transaction);
      const primaryProject = await this.links.primaryProject(id, transaction);
      const apartmentLinks = await this.links.apartmentLinks([id], transaction);
      return {
        ...quotationView({
          ...current,
          ruleConfiguration: configuration.rules,
          ruleConfigFingerprint: configuration.fingerprint,
          acknowledgedWarnings:
            configuration.fingerprint === quotation.ruleConfigFingerprint
              ? quotation.acknowledgedWarnings
              : [],
        }),
        primaryProject,
        apartmentLinks: apartmentLinks.get(id) ?? [],
        salesAgentName: salesAgent ? salesAgentDisplayName(salesAgent) : null,
      };
    });
  }
  async getForActor(
    id: string,
    actor: IAuthorizedUser,
  ): Promise<IQuotationDetailView> {
    const quotation = await this.getById(id);
    return this.projectDetailsForActor(quotation, actor);
  }
  projectDetailsForActor(
    quotation: IQuotationDetailView,
    actor: IAuthorizedUser,
  ): IQuotationDetailView {
    if (hasPermission(actor, PERMISSIONS.PROJECTS_READ)) {
      return quotation;
    }

    return { ...quotation, primaryProject: null, apartmentLinks: [] };
  }
  async apartmentOptions(id: string): Promise<IQuotationApartmentOptions> {
    await this.requireQuotation(id);
    const building = await this.requireBuilding(id);
    const apartments = await this.projects.listBuildingApartments(building.id);
    return {
      building,
      apartments: sortApartments(apartments.map(toQuotationApartment)),
    };
  }
  async setApartmentLinks(
    id: string,
    input: SetApartmentLinksDto,
  ): Promise<IQuotationDetailView> {
    await this.transactions.run(async (transaction) => {
      const current = await this.requireQuotation(id, transaction);
      if (current.status !== QUOTATION_STATUS.APPROVED) {
        throw new ConflictException(QUOTATION_SHARING_MESSAGES.NOT_APPROVED);
      }

      const savedLinks = await this.links.apartmentLinks([id], transaction);
      const savedIds =
        savedLinks.get(id)?.map((link) => link.apartmentId) ?? [];
      const expectedIds = input.expectedApartmentIds;
      const linksChanged =
        savedIds.length !== expectedIds.length ||
        savedIds.some((apartmentId) => !expectedIds.includes(apartmentId));
      if (linksChanged) {
        throw new ConflictException(QUOTATION_SHARING_MESSAGES.LINKS_CHANGED);
      }

      const building = await this.requireBuilding(id, transaction);
      const linkableIds = await this.linkableApartmentIds(
        { quotationId: id, buildingId: building.id },
        transaction,
      );
      const hasUnrelatedApartment = input.apartmentIds.some(
        (apartmentId) => !linkableIds.has(apartmentId),
      );
      if (hasUnrelatedApartment) {
        throw new BadRequestException(
          QUOTATION_SHARING_MESSAGES.UNRELATED_APARTMENT,
        );
      }

      await this.links.replaceApartmentLinks(
        id,
        input.apartmentIds,
        transaction,
      );
    });
    return this.getById(id);
  }
  async create(
    input: CreateQuotationDto,
    actor: IAuthorizedUser,
  ): Promise<IQuotationDetailView> {
    const customer = await this.customers.getById(input.customerId);
    await this.validateProject(input.customerId, input.projectId ?? null);
    await this.validateSalesAgent(input.salesAgentId ?? null, actor);
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
          number: await this.repository.nextNumber(prefix, transaction),
          customerId: customer.id,
          salesAgentId: input.salesAgentId ?? null,
          status: QUOTATION_STATUS.DRAFT,
          cancelledFromStatus: null,
          cancellationHistory: [],
          date,
          brand: '',
          brands: [],
          warningScopeVersion: WARNING_SCOPE_VERSION.PER_SYSTEM,
          paymentTerms: customer.paymentTerms ?? null,
          paymentTermsNote: '',
          paymentSchedule: [],
          discountPercent: '0',
          targetPretaxAmount: null,
          vatRate: DEFAULT_VAT_RATE,
          internalNotes: '',
          version: 1,
          acknowledgedWarnings: [],
          createdById: actor.id,
          updatedById: actor.id,
          approvedById: null,
          approvedAt: null,
        },
        transaction,
      );
      await this.links.replacePrimary(id, input.projectId ?? null, transaction);
    });
    return this.getById(id);
  }
  async delete(
    id: string,
    input: DeleteQuotationDto,
    userId: string,
  ): Promise<void> {
    await this.transactions.run(async (transaction) => {
      const current = await this.document(id, transaction);
      this.assertVersion(current, input.version);
      await this.repository.update(
        id,
        {
          deletedAt: new Date(),
          updatedById: userId,
          version: current.version + 1,
        },
        transaction,
      );
    });
  }
  async save(
    id: string,
    input: SaveQuotationDto,
    actor: IAuthorizedUser,
  ): Promise<IQuotationDetailView> {
    await this.customers.getById(input.customerId);
    await this.transactions.run(async (transaction) => {
      const current = await this.document(id, transaction);
      this.assertVersion(current, input.version);
      if (
        current.status === QUOTATION_STATUS.APPROVED ||
        current.status === QUOTATION_STATUS.CANCELLED
      ) {
        throw new ConflictException('יש לפתוח את ההצעה לעריכה לפני שינוי');
      }
      const salesAgentId =
        'salesAgentId' in input
          ? (input.salesAgentId ?? null)
          : current.salesAgentId;

      if (salesAgentId !== current.salesAgentId) {
        await this.validateSalesAgent(salesAgentId, actor);
      }

      await this.assertSharingKeepsContext(current, input, transaction);
      await this.validateProject(input.customerId, input.projectId);
      if (!input.brands && current.brands.length > 1) {
        throw new ConflictException(
          'יש לרענן את העורך כדי לשמור הצעה עם מספר חברות',
        );
      }
      if (new Decimal(input.discountPercent).gt(100)) {
        throw new BadRequestException('אחוז ההנחה חייב להיות עד100');
      }
      const configuration = await this.rules.configuration(transaction);
      const { brands, sections } = resolveQuotationBrandGroups(input);
      const snapshots = await this.selection.snapshots({
        current,
        input: { ...input, brands, sections },
        userId: actor.id,
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
          brand: section.brand,
          systemType: section.systemType,
          displayOrder,
        })),
        transaction,
      );
      await this.items.insert(snapshots, transaction);
      const { sections: ignored, version, projectId, ...attributes } = input;
      void ignored;
      await this.repository.update(
        id,
        {
          ...attributes,
          brands,
          warningScopeVersion: WARNING_SCOPE_VERSION.PER_SYSTEM,
          ruleConfiguration: configuration.rules,
          version: version + 1,
          status: QUOTATION_STATUS.DRAFT,
          salesAgentId,
          acknowledgedWarnings: [],
          approvedAt: null,
          approvedById: null,
          updatedById: actor.id,
        },
        transaction,
      );
      if (projectId !== current.projectId) {
        await this.links.replacePrimary(id, projectId, transaction);
      }
    });
    return this.getById(id);
  }
  async updateSalesAgent(
    id: string,
    input: UpdateSalesAgentDto,
    actor: IAuthorizedUser,
  ): Promise<IQuotationDetailView> {
    await this.transactions.run(async (transaction) => {
      const current = await this.document(id, transaction);
      this.assertVersion(current, input.version);
      if (input.salesAgentId !== current.salesAgentId) {
        await this.validateSalesAgent(input.salesAgentId, actor);
      }

      await this.repository.update(
        id,
        {
          salesAgentId: input.salesAgentId,
          updatedById: actor.id,
          version: current.version + 1,
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
  ): Promise<IQuotationDetailView> {
    await this.transactions.run(async (transaction) => {
      const current = await this.document(id, transaction);
      this.assertVersion(current, input.version);
      const allowed: Record<TQuotationStatus, TQuotationStatus[]> = {
        [QUOTATION_STATUS.DRAFT]: [QUOTATION_STATUS.REVIEW],
        [QUOTATION_STATUS.REVIEW]: [
          QUOTATION_STATUS.DRAFT,
          QUOTATION_STATUS.APPROVED,
        ],
        [QUOTATION_STATUS.APPROVED]: [QUOTATION_STATUS.DRAFT],
        [QUOTATION_STATUS.CANCELLED]: [],
      };
      if (!allowed[current.status].includes(input.status)) {
        throw new ConflictException('מעבר הסטטוס אינו תקין');
      }

      const configuration = await this.rules.configuration(transaction);
      const checked = {
        ...(await this.currentCatalogueState(current, transaction)),
        ruleConfiguration: configuration.rules,
        acknowledgedWarnings:
          configuration.fingerprint === current.ruleConfigFingerprint
            ? current.acknowledgedWarnings
            : [],
      };
      if (
        input.status === QUOTATION_STATUS.REVIEW &&
        !current.sections.some((section) => section.items.length)
      ) {
        throw new BadRequestException('יש להוסיף פריטים לפני בדיקה');
      }

      if (input.status === QUOTATION_STATUS.APPROVED) {
        const paymentIssues = quotationPaymentIssues(checked);
        const paymentError = [
          ...paymentIssues.terms,
          ...paymentIssues.schedule,
        ][0];
        if (paymentError) {
          throw new BadRequestException(paymentError);
        }
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
          acknowledgedWarnings: checked.acknowledgedWarnings,
          version: current.version + 1,
          updatedById: userId,
          approvedById: approved ? userId : null,
          approvedAt: approved ? new Date() : null,
          cancelledFromStatus: null,
        },
        transaction,
      );
    });
    return this.getById(id);
  }
  async cancel(
    id: string,
    input: CancelQuotationDto,
    user: IUser,
  ): Promise<IQuotationDetailView> {
    this.assertCancellationManager(user);
    const reason = input.reason?.trim();
    if (!reason || reason.length > MAX_QUOTATION_CANCELLATION_REASON_LENGTH) {
      throw new BadRequestException(
        `יש להזין סיבת ביטול עד ${MAX_QUOTATION_CANCELLATION_REASON_LENGTH} תווים`,
      );
    }
    await this.transactions.run(async (transaction) => {
      const current = await this.document(id, transaction);
      this.assertVersion(current, input.version);

      if (current.status === QUOTATION_STATUS.CANCELLED) {
        throw new ConflictException('הצעת המחיר כבר מבוטלת');
      }

      await this.cancelQuotation({
        quotation: current,
        actorId: user.id,
        actorName: quotationActorName(user),
        reason,
        kind: QUOTATION_CANCELLATION_KIND.MANUAL,
        cancelledAt: new Date().toISOString(),
        transaction,
      });
    });

    return this.getById(id);
  }
  async restore(
    id: string,
    input: QuotationCancellationDto,
    user: IUser,
  ): Promise<IQuotationDetailView> {
    if (user.role !== USER_ROLES.SYSTEM_ADMIN) {
      throw new ForbiddenException('רק מנהל מערכת רשאי לשחזר הצעת מחיר');
    }
    await this.transactions.run(async (transaction) => {
      const current = await this.document(id, transaction);
      this.assertVersion(current, input.version);
      const restored = restoreQuotationCancellation({
        history: current.cancellationHistory,
        restoredById: user.id,
        restoredByName: quotationActorName(user),
        restoredAt: new Date().toISOString(),
      });
      if (
        current.status !== QUOTATION_STATUS.CANCELLED ||
        current.cancelledFromStatus === null ||
        restored === null ||
        restored.status !== current.cancelledFromStatus
      ) {
        throw new ConflictException('לא ניתן לשחזר את הצעת המחיר');
      }
      await this.repository.update(
        id,
        {
          status: restored.status,
          cancelledFromStatus: null,
          cancellationHistory: restored.history,
          updatedById: user.id,
          version: current.version + 1,
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
  ): Promise<IQuotationDetailView> {
    await this.transactions.run(async (transaction) => {
      const current = await this.document(id, transaction);
      this.assertVersion(current, input.version);
      if (current.status === QUOTATION_STATUS.APPROVED) {
        throw new ConflictException('הצעה מאושרת נעולה');
      }

      if (current.status === QUOTATION_STATUS.CANCELLED) {
        throw new ConflictException('הצעה מבוטלת נעולה');
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
          acknowledgedWarnings: [...new Set(input.warningKeys)],
          version: current.version + 1,
          updatedById: userId,
        },
        transaction,
      );
    });
    return this.getById(id);
  }
  private async toPage(
    rows: Quotation[],
    query: GetQuotationsDto,
    transaction: Transaction,
  ): Promise<{ items: IQuotationView[]; nextCursor: string | null }> {
    const page = rows.slice(0, query.batchSize ?? 20);
    const ids = page.map((row) => row.id);
    const sections = await this.sections.list(ids, transaction);
    const items = await this.items.list(
      sections.map((section) => section.id),
      transaction,
    );
    const configuration = await this.rules.configuration(transaction);
    const catalogue = await this.catalogue.getByIds(
      items.map((item) => item.catalogueItemId),
      transaction,
    );
    const primaryProjects = await this.links.primaryProjects(ids, transaction);
    const statuses = new Map(catalogue.map((item) => [item.id, item.status]));
    const documents = page.map((row) => ({
      ...row.toJSON(),
      projectId: primaryProjects.get(row.id)?.id ?? null,
      ruleConfigFingerprint: validateRuleConfiguration(row.ruleConfiguration)
        .fingerprint,
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
    const views = documents.map((document) => {
      const usesApprovedSnapshot = hasApprovedQuotationSnapshot(document);
      const current = usesApprovedSnapshot
        ? document
        : this.overlayCatalogueStatuses(document, statuses);
      const rules = usesApprovedSnapshot
        ? {
            rules: document.ruleConfiguration,
            fingerprint: document.ruleConfigFingerprint,
          }
        : configuration;

      return quotationView({
        ...current,
        ruleConfiguration: rules.rules,
        ruleConfigFingerprint: rules.fingerprint,
        acknowledgedWarnings:
          rules.fingerprint === document.ruleConfigFingerprint
            ? document.acknowledgedWarnings
            : [],
      });
    });
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
  }
  private async requireQuotation(
    id: string,
    transaction?: Transaction,
  ): Promise<Quotation> {
    const quotation = await this.repository.findById(id, transaction);
    if (!quotation) {
      throw new NotFoundException('הצעת המחיר לא נמצאה');
    }

    return quotation;
  }
  private async requireBuilding(
    quotationId: string,
    transaction?: Transaction,
  ): Promise<IQuotationPrimaryProject> {
    const primaryProject = await this.links.primaryProject(
      quotationId,
      transaction,
    );
    if (primaryProject?.kind !== CUSTOMER_PROJECT_KINDS.BUILDING) {
      throw new BadRequestException(QUOTATION_SHARING_MESSAGES.NOT_BUILDING);
    }

    return primaryProject;
  }
  private async linkableApartmentIds(
    scope: { quotationId: string; buildingId: string },
    transaction: Transaction,
  ): Promise<Set<string>> {
    const apartments = await this.projects.listBuildingApartments(
      scope.buildingId,
      transaction,
    );
    const existingLinks = await this.links.apartmentLinks(
      [scope.quotationId],
      transaction,
    );
    const keptIds = (existingLinks.get(scope.quotationId) ?? []).map(
      (link) => link.apartmentId,
    );
    return new Set([
      ...apartments.map((apartment) => apartment.id),
      ...keptIds,
    ]);
  }
  private async assertSharingKeepsContext(
    current: IQuotationDocument,
    input: SaveQuotationDto,
    transaction: Transaction,
  ): Promise<void> {
    const isProjectChanging = input.projectId !== current.projectId;
    const isCustomerChanging = input.customerId !== current.customerId;
    if (!isProjectChanging && !isCustomerChanging) {
      return;
    }

    const apartmentLinkCount = await this.links.countApartmentLinks(
      current.id,
      transaction,
    );
    if (apartmentLinkCount > 0) {
      throw new ConflictException(
        QUOTATION_SHARING_MESSAGES.LINKS_LOCK_CONTEXT,
      );
    }
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
  private async cancelQuotation(input: ICancelQuotationInput): Promise<void> {
    if (input.quotation.status === QUOTATION_STATUS.CANCELLED) {
      throw new ConflictException('הצעת המחיר כבר מבוטלת');
    }

    const fromStatus = input.quotation.status;

    await this.repository.update(
      input.quotation.id,
      {
        status: QUOTATION_STATUS.CANCELLED,
        cancelledFromStatus: fromStatus,
        cancellationHistory: appendQuotationCancellation({
          history: input.quotation.cancellationHistory,
          fromStatus,
          cancelledById: input.actorId,
          cancelledByName: input.actorName,
          reason: input.reason,
          kind: input.kind,
          cancelledAt: input.cancelledAt,
        }),
        updatedById: input.actorId,
        version: input.quotation.version + 1,
      },
      input.transaction,
    );
  }
  private assertCancellationManager(user: IUser): void {
    const canManageCancellation =
      user.role === USER_ROLES.ENGINEER ||
      user.role === USER_ROLES.SYSTEM_ADMIN;
    if (!canManageCancellation) {
      throw new ForbiddenException('אין הרשאה לבטל או לשחזר הצעות מחיר');
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

  private async validateSalesAgent(
    salesAgentId: string | null,
    actor: IAuthorizedUser,
  ): Promise<void> {
    if (salesAgentId === null) {
      return;
    }

    assertPermissions(actor, PERMISSIONS.EMPLOYEES_READ);

    const salesAgent = await this.users.findById(salesAgentId);
    const hasEligibleRole = salesAgent?.assignedRoles?.includes(
      USER_ROLES.SALES_AGENT,
    );

    if (!salesAgent || !hasEligibleRole) {
      throw new BadRequestException('יש לבחור עובד פעיל בתפקיד סוכן מכירות');
    }
  }
}
