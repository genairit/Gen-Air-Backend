import {
  TProjectTaskEnvironment,
  createProjectTaskEnvironment,
} from './project-task-initialization.fixture';

import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { QueryTypes } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { UserService } from '@Modules/user/user.service';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectService } from '@Modules/project/project.service';
import { Project } from '@Modules/project/entities/project.entity';
import { ProviderNames } from '@Providers/database/provider-names';
import { CustomerService } from '@Modules/customer/customer.service';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { authorizedUser } from '../src/testing/authorization.fixture';
import { UserRoleService } from '@Modules/user-role/user-role.service';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';
import { QuotationService } from '@Modules/quotation/quotation.service';
import { quotationRuleFixture } from '../src/testing/quotation.fixture';
import { Quotation } from '@Modules/quotation/entities/quotation.entity';
import { QuotationRepository } from '@Modules/quotation/quotation.repository';
import type { SaveQuotationDto } from '@Modules/quotation/dto/save-quotation.dto';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import { QuotationItem } from '@Modules/quotation-item/entities/quotation-item.entity';
import { CatalogueItem } from '@Modules/catalogue-item/entities/catalogue-item.entity';
import { QuotationRule } from '@Modules/quotation-rule/entities/quotation-rule.entity';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { QuotationSelectionService } from '@Modules/quotation/quotation-selection.service';
import { QuotationItemRepository } from '@Modules/quotation-item/quotation-item.repository';
import { CatalogueItemRepository } from '@Modules/catalogue-item/catalogue-item.repository';
import { QuotationRuleRepository } from '@Modules/quotation-rule/quotation-rule.repository';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';
import { QuotationProjectService } from '@Modules/quotation-project/quotation-project.service';
import { QuotationSection } from '@Modules/quotation-section/entities/quotation-section.entity';
import { QuotationProject } from '@Modules/quotation-project/entities/quotation-project.entity';
import { QUOTATION_SHARING_MESSAGES } from '@Modules/quotation/constants/quotation-sharing.constant';
import { QuotationSectionRepository } from '@Modules/quotation-section/quotation-section.repository';
import { QuotationProjectRepository } from '@Modules/quotation-project/quotation-project.repository';
import type { IQuotationDetailView } from '@Modules/quotation/interfaces/quotation-document.interface';
import { CatalogueItemUsageService } from '@Modules/catalogue-item-usage/catalogue-item-usage.service';
import { CatalogueItemUsage } from '@Modules/catalogue-item-usage/entities/catalogue-item-usage.entity';
import { CatalogueItemUsageRepository } from '@Modules/catalogue-item-usage/catalogue-item-usage.repository';

jest.setTimeout(120000);

const MIGRATION_FILE = resolve(
  __dirname,
  '../migrations/2026-11-09-quotation-project-links.sql',
);

interface ISharingFixture {
  building: Project;
  standalone: Project;
  apartments: Project[];
  otherBuilding: Project;
  otherApartment: Project;
  legacyProjectId: string;
  otherCustomerId: string;
  legacyQuotationId: string;
}

const state: {
  environment: TProjectTaskEnvironment | null;
  service: QuotationService | null;
  fixture: ISharingFixture | null;
} = { environment: null, service: null, fixture: null };

const requireState = () => {
  if (!state.environment || !state.service || !state.fixture) {
    throw new Error('Quotation sharing environment is not initialized');
  }
  return {
    environment: state.environment,
    service: state.service,
    fixture: state.fixture,
  };
};

const quotationActor = (creatorId: string) => ({
  ...authorizedUser(),
  id: creatorId,
});

const apartmentOf = (
  building: Project,
  number: string,
  floor: number,
  customerName: string | null = null,
) =>
  Project.create({
    name: `דירה ${number}`,
    code: `${building.code}-${number}`,
    customerApartment: number,
    customerFloor: floor,
    customerName,
    parentProjectId: building.id,
    projectTypeId: building.projectTypeId,
    stageId: PROJECT_STATUS_IDS.NOT_STARTED,
    createdById: building.createdById,
  });

const savePayload = (
  quotation: IQuotationDetailView,
  changes: Partial<SaveQuotationDto> = {},
): SaveQuotationDto => ({
  version: quotation.version,
  customerId: quotation.customerId,
  projectId: quotation.projectId,
  date: quotation.date,
  brand: quotation.brand,
  brands: quotation.brands,
  paymentTerms: quotation.paymentTerms,
  paymentTermsNote: quotation.paymentTermsNote,
  paymentSchedule: quotation.paymentSchedule,
  discountPercent: quotation.discountPercent,
  targetPretaxAmount: quotation.targetPretaxAmount,
  internalNotes: quotation.internalNotes,
  sections: [],
  ...changes,
});

const createSchema = async (environment: TProjectTaskEnvironment) => {
  const { sequelize } = environment;
  sequelize.addModels([
    Quotation,
    QuotationSection,
    QuotationItem,
    QuotationRule,
    CatalogueItem,
    CatalogueItemUsage,
    QuotationProject,
  ]);
  await Promise.all([
    Quotation.sync(),
    QuotationRule.sync(),
    CatalogueItem.sync(),
  ]);
  await Promise.all([QuotationSection.sync(), CatalogueItemUsage.sync()]);
  await QuotationItem.sync();
  await QuotationRule.bulkCreate(quotationRuleFixture([]));
  await sequelize.query(
    'ALTER TABLE quotations ADD COLUMN project_id uuid REFERENCES projects(id); CREATE INDEX idx_quotations_project ON quotations(project_id)',
  );
};

const createFixture = async (
  environment: TProjectTaskEnvironment,
): Promise<ISharingFixture> => {
  const building = await environment.createLegacyProject('בניין שיתוף', true);
  const otherBuilding = await environment.createLegacyProject(
    'בניין אחר',
    true,
  );
  const standalone = await environment.createLegacyProject('פרויקט רגיל');
  const apartments = [
    await apartmentOf(building, '12', 3, 'דייר שתיים עשרה'),
    await apartmentOf(building, '4', 1, 'דייר ארבע'),
    await apartmentOf(building, '7', 2),
    await apartmentOf(building, '2א', 1),
  ];
  const otherApartment = await apartmentOf(otherBuilding, '1', 1);
  const otherCustomer = await Customer.create({
    name: 'לקוח אחר',
    taxId: '510000003',
    phone: '03-7654321',
    email: 'other-customer@example.invalid',
    address: 'רחוב אחר 2',
    contactName: 'איש קשר אחר',
    customerType: PROJECT_DETAIL_FIELD_SETS.COMPANY,
    createdById: environment.creator.id,
  });
  const legacyQuotationId = randomUUID();
  await environment.sequelize.query(
    `INSERT INTO quotations (id, number, customer_id, project_id, status, date, brand, brands, warning_scope_version, payment_terms_note, payment_schedule, discount_percent, vat_rate, internal_notes, version, acknowledged_warnings, created_by_id, updated_by_id, rule_configuration, created_at, updated_at)
     VALUES ($id, '2611-900001', $customerId, $projectId, 'approved', '2026-11-01', '', '[]', 2, '', '[]', 0, 18, '', 3, '[]', $creatorId, $creatorId, $rules::jsonb, now(), now())`,
    {
      bind: {
        id: legacyQuotationId,
        customerId: environment.customer.id,
        projectId: standalone.id,
        creatorId: environment.creator.id,
        rules: JSON.stringify(quotationRuleFixture([])),
      },
    },
  );
  return {
    building,
    apartments,
    otherBuilding,
    standalone,
    otherApartment,
    legacyQuotationId,
    legacyProjectId: standalone.id,
    otherCustomerId: otherCustomer.id,
  };
};

const createService = async (environment: TProjectTaskEnvironment) => {
  const module = await Test.createTestingModule({
    providers: [
      QuotationService,
      QuotationRepository,
      QuotationProjectService,
      QuotationProjectRepository,
      QuotationSelectionService,
      QuotationSectionService,
      QuotationSectionRepository,
      QuotationItemService,
      QuotationItemRepository,
      CatalogueItemService,
      CatalogueItemRepository,
      CatalogueItemUsageService,
      CatalogueItemUsageRepository,
      QuotationRuleService,
      QuotationRuleRepository,
      DatabaseTransactionService,
      { provide: ProviderNames.SEQUELIZE, useValue: environment.sequelize },
      { provide: UserService, useValue: {} },
      { provide: UserRoleService, useValue: {} },
      { provide: ProjectService, useValue: environment.projects },
      {
        provide: CustomerService,
        useValue: {
          getById: () =>
            Promise.resolve({
              ...environment.customer.get(),
              paymentTerms: null,
            }),
        },
      },
    ],
  }).compile();
  return module.get(QuotationService);
};

const approve = (quotationId: string) =>
  Quotation.update(
    { status: QUOTATION_STATUS.APPROVED },
    { where: { id: quotationId } },
  );

const createSharedQuotation = async () => {
  const { environment, service, fixture } = requireState();
  const quotation = await service.create(
    { customerId: environment.customer.id, projectId: fixture.building.id },
    quotationActor(environment.creator.id),
  );
  await approve(quotation.id);
  return quotation;
};

describe('quotation project links on isolated PostgreSQL', () => {
  beforeAll(async () => {
    const environment = await createProjectTaskEnvironment();
    state.environment = environment;
    await createSchema(environment);
    state.fixture = await createFixture(environment);
    const migration = await readFile(MIGRATION_FILE, 'utf8');
    await environment.sequelize.query(migration);
    await environment.sequelize.query(migration);
    state.service = await createService(environment);
  });

  afterAll(async () => {
    await state.environment?.close();
  });

  it('migrates project_id into one primary link and retires the column', async () => {
    const { environment, service, fixture } = requireState();
    const columns = await environment.sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'quotations' AND column_name = 'project_id'",
      { type: QueryTypes.SELECT },
    );
    const links = await QuotationProject.findAll({
      where: { quotationId: fixture.legacyQuotationId },
    });
    const legacy = await service.getById(fixture.legacyQuotationId);

    expect(columns).toEqual([]);
    expect(links.map((link) => link.get({ plain: true }))).toMatchObject([
      { projectId: fixture.legacyProjectId, isPrimary: true },
    ]);
    expect(legacy).toMatchObject({
      number: '2611-900001',
      version: 3,
      status: QUOTATION_STATUS.APPROVED,
      projectId: fixture.legacyProjectId,
      primaryProject: { id: fixture.legacyProjectId, kind: 'project' },
      apartmentLinks: [],
    });
  });

  it('creates the primary link from the project the quotation was created under', async () => {
    const { environment, service, fixture } = requireState();
    const quotation = await service.create(
      { customerId: environment.customer.id, projectId: fixture.building.id },
      quotationActor(environment.creator.id),
    );

    expect(quotation.primaryProject).toEqual({
      id: fixture.building.id,
      name: fixture.building.name,
      code: fixture.building.code,
      kind: 'building',
    });
    expect(quotation.apartmentLinks).toEqual([]);
  });

  it('lists every live apartment of the primary building for the picker', async () => {
    const { service, fixture } = requireState();
    const quotation = await createSharedQuotation();
    const options = await service.apartmentOptions(quotation.id);

    expect(options.building.id).toBe(fixture.building.id);
    expect(options.apartments).toEqual([
      expect.objectContaining({ apartmentNumber: '2א', floor: 1 }),
      expect.objectContaining({
        apartmentNumber: '4',
        floor: 1,
        endCustomerName: 'דייר ארבע',
      }),
      expect.objectContaining({ apartmentNumber: '7', endCustomerName: null }),
      expect.objectContaining({ apartmentNumber: '12', floor: 3 }),
    ]);
  });

  it('rejects link edits on drafts, non-building primaries and unrelated apartments', async () => {
    const { environment, service, fixture } = requireState();
    const draft = await service.create(
      { customerId: environment.customer.id, projectId: fixture.building.id },
      quotationActor(environment.creator.id),
    );
    const standalone = await service.create(
      { customerId: environment.customer.id, projectId: fixture.standalone.id },
      quotationActor(environment.creator.id),
    );
    await approve(standalone.id);
    const approved = await createSharedQuotation();

    await expect(
      service.setApartmentLinks(draft.id, {
        expectedApartmentIds: [],
        apartmentIds: [fixture.apartments[0].id],
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: QUOTATION_SHARING_MESSAGES.NOT_APPROVED,
    });
    await expect(
      service.setApartmentLinks(standalone.id, {
        expectedApartmentIds: [],
        apartmentIds: [fixture.apartments[0].id],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(service.apartmentOptions(standalone.id)).rejects.toMatchObject(
      { status: 400 },
    );
    for (const unrelatedId of [
      fixture.otherApartment.id,
      fixture.otherBuilding.id,
      fixture.standalone.id,
      fixture.building.id,
      randomUUID(),
    ]) {
      await expect(
        service.setApartmentLinks(approved.id, {
          expectedApartmentIds: [],
          apartmentIds: [fixture.apartments[0].id, unrelatedId],
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: QUOTATION_SHARING_MESSAGES.UNRELATED_APARTMENT,
      });
    }
    expect(
      await QuotationProject.count({
        where: { quotationId: approved.id, isPrimary: false },
      }),
    ).toBe(0);
  });

  it('shares one approved quotation without changing its version, status or approval', async () => {
    const { service, fixture } = requireState();
    const quotation = await createSharedQuotation();
    const before = await Quotation.findByPk(quotation.id);
    const [twelve, four] = fixture.apartments;
    const shared = await service.setApartmentLinks(quotation.id, {
      expectedApartmentIds: [],
      apartmentIds: [twelve.id, four.id],
    });
    const after = await Quotation.findByPk(quotation.id);

    expect(shared.apartmentLinks).toEqual([
      expect.objectContaining({ apartmentId: four.id, available: true }),
      expect.objectContaining({ apartmentId: twelve.id, available: true }),
    ]);
    expect(after?.version).toBe(before?.version);
    expect(after?.status).toBe(QUOTATION_STATUS.APPROVED);
    expect(after?.updatedAt.toISOString()).toBe(
      before?.updatedAt.toISOString(),
    );
    expect(shared.number).toBe(quotation.number);
  });

  it('rejects a stale sharing selection without overwriting the current links', async () => {
    const { service, fixture } = requireState();
    const quotation = await createSharedQuotation();
    const [twelve, four] = fixture.apartments;
    await service.setApartmentLinks(quotation.id, {
      expectedApartmentIds: [],
      apartmentIds: [twelve.id],
    });

    await expect(
      service.setApartmentLinks(quotation.id, {
        expectedApartmentIds: [],
        apartmentIds: [four.id],
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: QUOTATION_SHARING_MESSAGES.LINKS_CHANGED,
    });
    const saved = await service.getById(quotation.id);
    expect(saved.apartmentLinks.map((link) => link.apartmentId)).toEqual([
      twelve.id,
    ]);
  });

  it('hides linked apartment details from a quotation-only reader', async () => {
    const { service, fixture } = requireState();
    const quotation = await createSharedQuotation();
    await service.setApartmentLinks(quotation.id, {
      expectedApartmentIds: [],
      apartmentIds: [fixture.apartments[0].id],
    });
    const actor = {
      ...authorizedUser(),
      permissions: [PERMISSIONS.QUOTATIONS_READ],
    };

    const detail = await service.getForActor(quotation.id, actor);
    expect(detail.apartmentLinks).toEqual([]);
    expect(detail.primaryProject).toBeNull();
    expect(detail.id).toBe(quotation.id);
  });

  it('lists the same quotation once under the building and its selected apartments only', async () => {
    const { service, fixture } = requireState();
    const quotation = await createSharedQuotation();
    const [twelve, four, seven] = fixture.apartments;
    await service.setApartmentLinks(quotation.id, {
      expectedApartmentIds: [],
      apartmentIds: [twelve.id, four.id],
    });

    const building = await service.listByProject(fixture.building.id, {
      batchSize: 50,
    });
    const buildingRow = building.items.find((row) => row.id === quotation.id);
    const apartment = await service.listByProject(four.id, {});
    const unselected = await service.listByProject(seven.id, {});
    const global = await service.list({ search: quotation.number });
    const counts = await service.statusCounts({ search: quotation.number });

    expect(buildingRow).toMatchObject({
      projectRole: 'primary',
      sharedFromCode: null,
      sharedCount: 2,
      sharedApartmentNumbers: ['4', '12'],
    });
    expect(building.total).toBe(building.items.length);
    expect(new Set(building.items.map((row) => row.id)).size).toBe(
      building.items.length,
    );
    expect(apartment.items.map((row) => row.id)).toContain(quotation.id);
    expect(
      apartment.items.find((row) => row.id === quotation.id),
    ).toMatchObject({
      projectRole: 'shared',
      sharedFromCode: fixture.building.code,
      number: quotation.number,
      totals: buildingRow?.totals,
    });
    expect(unselected.items.map((row) => row.id)).not.toContain(quotation.id);
    expect(global.items.map((row) => row.id)).toEqual([quotation.id]);
    expect(global.items[0].projectId).toBe(fixture.building.id);
    expect(counts.all).toBe(1);
  });

  it('removing one link or all sharing keeps the quotation and the other links', async () => {
    const { service, fixture } = requireState();
    const quotation = await createSharedQuotation();
    const [twelve, four, seven] = fixture.apartments;
    await service.setApartmentLinks(quotation.id, {
      expectedApartmentIds: [],
      apartmentIds: [twelve.id, four.id, seven.id],
    });
    const reduced = await service.setApartmentLinks(quotation.id, {
      expectedApartmentIds: [twelve.id, four.id, seven.id],
      apartmentIds: [twelve.id, seven.id],
    });
    const fourList = await service.listByProject(four.id, {});

    expect(reduced.apartmentLinks.map((link) => link.apartmentId)).toEqual([
      seven.id,
      twelve.id,
    ]);
    expect(fourList.items.map((row) => row.id)).not.toContain(quotation.id);

    const unshared = await service.setApartmentLinks(quotation.id, {
      expectedApartmentIds: [twelve.id, seven.id],
      apartmentIds: [],
    });
    const building = await service.listByProject(fixture.building.id, {
      batchSize: 50,
    });

    expect(unshared.apartmentLinks).toEqual([]);
    expect(unshared.primaryProject?.id).toBe(fixture.building.id);
    expect(await Quotation.count({ where: { id: quotation.id } })).toBe(1);
    expect(building.items.find((row) => row.id === quotation.id)).toMatchObject(
      { projectRole: 'primary', sharedCount: 0 },
    );
  });

  it('keeps links when reopened to draft, locks editing and blocks context changes', async () => {
    const { environment, service, fixture } = requireState();
    const quotation = await createSharedQuotation();
    const [twelve] = fixture.apartments;
    await service.setApartmentLinks(quotation.id, {
      expectedApartmentIds: [],
      apartmentIds: [twelve.id],
    });
    await Quotation.update(
      { status: QUOTATION_STATUS.DRAFT },
      { where: { id: quotation.id } },
    );
    const draft = await service.getById(quotation.id);
    const apartment = await service.listByProject(twelve.id, {});

    expect(draft.apartmentLinks).toHaveLength(1);
    expect(apartment.items.find((row) => row.id === quotation.id)?.status).toBe(
      QUOTATION_STATUS.DRAFT,
    );
    await expect(
      service.setApartmentLinks(quotation.id, {
        expectedApartmentIds: [twelve.id],
        apartmentIds: [],
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.save(
        quotation.id,
        savePayload(draft, { projectId: fixture.standalone.id }),
        quotationActor(environment.creator.id),
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: QUOTATION_SHARING_MESSAGES.LINKS_LOCK_CONTEXT,
    });
    await expect(
      service.save(
        quotation.id,
        savePayload(draft, { customerId: fixture.otherCustomerId }),
        quotationActor(environment.creator.id),
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: QUOTATION_SHARING_MESSAGES.LINKS_LOCK_CONTEXT,
    });
    const saved = await service.save(
      quotation.id,
      savePayload(draft, { internalNotes: 'עדכון תוכן' }),
      quotationActor(environment.creator.id),
    );

    expect(saved.version).toBe(draft.version + 1);
    expect(saved.apartmentLinks).toHaveLength(1);
    expect(saved.primaryProject?.id).toBe(fixture.building.id);
  });

  it('moves the primary on save when no apartment links exist', async () => {
    const { environment, service, fixture } = requireState();
    const quotation = await service.create(
      { customerId: environment.customer.id, projectId: fixture.building.id },
      quotationActor(environment.creator.id),
    );
    const moved = await service.save(
      quotation.id,
      savePayload(quotation, { projectId: fixture.standalone.id }),
      quotationActor(environment.creator.id),
    );
    const cleared = await service.save(
      quotation.id,
      savePayload(moved, { projectId: null }),
      quotationActor(environment.creator.id),
    );

    expect(moved.primaryProject?.id).toBe(fixture.standalone.id);
    expect(cleared.primaryProject).toBeNull();
    expect(
      await QuotationProject.count({ where: { quotationId: quotation.id } }),
    ).toBe(0);
  });

  it('marks deleted apartments unavailable, uncounted and without access', async () => {
    const { environment, service, fixture } = requireState();
    const quotation = await createSharedQuotation();
    const doomed = await apartmentOf(fixture.building, '99', 9);
    const [twelve] = fixture.apartments;
    await service.setApartmentLinks(quotation.id, {
      expectedApartmentIds: [],
      apartmentIds: [twelve.id, doomed.id],
    });
    await doomed.destroy();
    const detail = await service.getById(quotation.id);
    const building = await service.listByProject(fixture.building.id, {
      batchSize: 50,
    });
    const [scoped] = await environment.sequelize.query<{ total: number }>(
      'SELECT count(*)::integer AS total FROM quotation_projects WHERE quotation_id = $id AND NOT is_primary',
      { type: QueryTypes.SELECT, bind: { id: quotation.id } },
    );

    expect(detail.apartmentLinks).toEqual([
      expect.objectContaining({ apartmentId: twelve.id, available: true }),
      expect.objectContaining({ apartmentId: doomed.id, available: false }),
    ]);
    expect(building.items.find((row) => row.id === quotation.id)).toMatchObject(
      { sharedCount: 1, sharedApartmentNumbers: ['12'] },
    );
    expect(scoped.total).toBe(2);
    await expect(service.listByProject(doomed.id, {})).rejects.toMatchObject({
      status: 404,
    });
    const kept = await service.setApartmentLinks(quotation.id, {
      expectedApartmentIds: [twelve.id, doomed.id],
      apartmentIds: [twelve.id, doomed.id],
    });
    expect(kept.apartmentLinks).toHaveLength(2);
  });
});
