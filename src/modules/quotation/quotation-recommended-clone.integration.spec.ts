import {
  SYSTEM_TYPE,
  CONTROL_KIND,
  EQUIPMENT_ROLE,
  QUOTATION_STATUS,
  CATALOGUE_STATUS,
  CATALOGUE_PREFERENCE,
} from './constants/quotation.constant';

import {
  CLONE_TEST_SKU,
  CLONE_TEST_BRAND,
  CLONE_TEST_SCENARIO,
  CLONE_TEST_EQUIPMENT_TYPE,
} from './testing/quotation-clone.constant';

import { promisify } from 'node:util';
import { Test } from '@nestjs/testing';
import { QueryTypes } from 'sequelize';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import { execFile } from 'node:child_process';
import { AuthGuard } from '@Guards/auth.guard';
import { TIME_UNITS } from '@Constants/time.constant';
import type { Sequelize } from 'sequelize-typescript';
import { QuotationService } from './quotation.service';
import { AuthService } from '@Modules/auth/auth.service';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { QuotationController } from './quotation.controller';
import { QuotationPdfService } from './quotation-pdf.service';
import { getHttpErrorResponse } from '@Utilities/http-error.utility';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { quotationItemFixture } from '../../testing/quotation.fixture';
import { TaskQuotationFixture } from './testing/task-quotation.fixture';
import type { IQuotationDetailView } from './interfaces/quotation-document.interface';
import { QuotationRule } from '@Modules/quotation-rule/entities/quotation-rule.entity';
import { CatalogueItem } from '@Modules/catalogue-item/entities/catalogue-item.entity';
import { QuotationItem } from '@Modules/quotation-item/entities/quotation-item.entity';
import type { RecommendedCloneQuotationDto } from './dto/recommended-clone-quotation.dto';
import { QUOTATION_RULE } from '@Modules/quotation-rule/constants/quotation-rule.constant';
import type { IQuotationItem } from '@Modules/quotation-item/interfaces/quotation-item.interface';

const fixture = new TaskQuotationFixture();
const database = (): Sequelize => fixture.database();
const service = (): QuotationService =>
  fixture.service(fixture.catalogue(), fixture.rules());
const sourceCatalogueId = randomUUID();
const targetCatalogueId = randomUUID();
const generalCatalogueId = randomUUID();
const seedCatalogue = (
  id: string,
  brand: string,
  sku: string,
  changes: Partial<CatalogueItem> = {},
): Promise<CatalogueItem> =>
  CatalogueItem.create({
    id,
    brand,
    sku,
    price: '222',
    unit: 'unit',
    description: sku,
    capacityBtu: 12000,
    systemType: SYSTEM_TYPE.SINGLE,
    equipmentRole: EQUIPMENT_ROLE.UNIT,
    equipmentTypes: [CLONE_TEST_EQUIPMENT_TYPE.WALL],
    status: CATALOGUE_STATUS.ACTIVE,
    preference: CATALOGUE_PREFERENCE.NEUTRAL,
    includesRemote: false,
    includesThermostat: false,
    ...changes,
  });
const seedSource = async (): Promise<string> => {
  const result = await service().createForTask(fixture.taskId, fixture.actor);
  await database().query(
    'UPDATE quotations SET brand=$brand,brands=$brands WHERE id=$id',
    {
      bind: {
        id: result.quotationId,
        brand: CLONE_TEST_BRAND.SOURCE,
        brands: JSON.stringify([CLONE_TEST_BRAND.SOURCE]),
      },
    },
  );
  const sectionId = randomUUID();
  await database().query(
    'INSERT INTO quotation_sections(id,quotation_id,title,brand,system_type,display_order,created_at,updated_at) VALUES ($sectionId,$id,$title,$brand,$system,0,now(),now())',
    {
      bind: {
        sectionId,
        id: result.quotationId,
        title: 'System',
        brand: CLONE_TEST_BRAND.SOURCE,
        system: SYSTEM_TYPE.SINGLE,
      },
    },
  );
  await QuotationItem.bulkCreate([
    {
      ...quotationItemFixture(),
      id: randomUUID(),
      sectionId,
      catalogueItemId: sourceCatalogueId,
      sku: CLONE_TEST_SKU.SOURCE,
      quantity: '3',
      equipmentRole: EQUIPMENT_ROLE.UNIT,
      equipmentType: CLONE_TEST_EQUIPMENT_TYPE.WALL,
      capacityBtu: 12000,
    },
    {
      ...quotationItemFixture(),
      id: randomUUID(),
      sectionId,
      catalogueItemId: generalCatalogueId,
      sku: CLONE_TEST_SKU.GENERAL,
      quantity: '2',
      quotedPrice: '55',
      equipmentRole: EQUIPMENT_ROLE.OTHER,
      equipmentType: null,
      capacityBtu: null,
    },
  ]);
  return result.quotationId;
};
const input = (): RecommendedCloneQuotationDto => ({
  sourceVersion: 1,
  targetBrand: CLONE_TEST_BRAND.TARGET,
  idempotencyKey: randomUUID(),
});
beforeAll(async (): Promise<void> => {
  await fixture.start();
  await fixture.installCloneCommands();
}, 30 * TIME_UNITS.SECOND_MS);
afterAll((): Promise<void> => fixture.close());
beforeEach(async (): Promise<void> => {
  await database().query(
    'TRUNCATE quotation_clone_commands,task_quotation_links,quotation_projects,quotation_items,quotation_sections,quotations',
  );
  await database().query('TRUNCATE catalogue_items,catalogue_item_usage');
  await seedCatalogue(
    sourceCatalogueId,
    CLONE_TEST_BRAND.SOURCE,
    CLONE_TEST_SKU.SOURCE,
  );
  await seedCatalogue(
    targetCatalogueId,
    CLONE_TEST_BRAND.TARGET,
    CLONE_TEST_SKU.TARGET,
  );
  await seedCatalogue(
    generalCatalogueId,
    CLONE_TEST_BRAND.GENERAL,
    CLONE_TEST_SKU.GENERAL,
    {
      equipmentRole: EQUIPMENT_ROLE.OTHER,
      capacityBtu: null,
    },
  );
});
it('serializes same-key parallel requests into one command, number and draft, preserving General and source', async (): Promise<void> => {
  const sourceId = await seedSource();
  const source = await service().document(sourceId);
  const command = input();
  const results = await Promise.all(
    Array.from({ length: 5 }, (): Promise<IQuotationDetailView> =>
      service().cloneRecommended(sourceId, command, fixture.actor),
    ),
  );
  expect(new Set(results.map((result): string => result.id)).size).toBe(1);
  expect(
    (await database().query('SELECT * FROM quotation_clone_commands'))[0],
  ).toHaveLength(1);
  expect(
    (await database().query('SELECT DISTINCT number FROM quotations'))[0],
  ).toHaveLength(2);
  expect(await service().document(sourceId)).toEqual(source);
  expect(
    results[0].sections.flatMap((section): IQuotationItem[] => section.items),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sku: CLONE_TEST_SKU.GENERAL,
        quantity: '2.0000',
        quotedPrice: '55.0000',
      }),
      expect.objectContaining({
        sku: CLONE_TEST_SKU.TARGET,
        quantity: '3.0000',
        quotedPrice: '222.0000',
      }),
    ]),
  );
  expect(results[0].taskLinks).toEqual([
    { taskId: fixture.taskId, title: 'Quotation task', isPrimary: false },
  ]);
});
it('replays original result after response loss, source version changes and catalogue retirement, with fresh permission checks', async (): Promise<void> => {
  const sourceId = await seedSource();
  const command = input();
  const first = await service().cloneRecommended(
    sourceId,
    command,
    fixture.actor,
  );
  await database().query(
    'UPDATE quotations SET version=version+1 WHERE id=$id',
    { bind: { id: sourceId } },
  );
  await CatalogueItem.update(
    { status: CATALOGUE_STATUS.ARCHIVED },
    { where: { id: targetCatalogueId } },
  );
  expect(
    (await service().cloneRecommended(sourceId, command, fixture.actor)).id,
  ).toBe(first.id);
  await expect(
    service().cloneRecommended(
      sourceId,
      { ...command, targetBrand: CLONE_TEST_BRAND.OTHER },
      fixture.actor,
    ),
  ).rejects.toThrow('בקשת השכפול');
  await expect(
    service().cloneRecommended(sourceId, command, {
      ...fixture.actor,
      permissions: [],
    }),
  ).rejects.toThrow('permission');
});
it('rolls back the command, draft, number and links on insertion failure, then retries successfully', async (): Promise<void> => {
  const sourceId = await seedSource();
  const command = input();
  await database().query(
    "CREATE FUNCTION reject_clone() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'clone rollback'; END $$; CREATE TRIGGER reject_clone BEFORE INSERT ON quotation_clone_commands FOR EACH ROW EXECUTE FUNCTION reject_clone()",
  );
  try {
    await expect(
      service().cloneRecommended(sourceId, command, fixture.actor),
    ).rejects.toThrow('clone rollback');
    expect(
      (await database().query('SELECT * FROM quotation_clone_commands'))[0],
    ).toHaveLength(0);
    expect(
      (await database().query('SELECT * FROM quotations'))[0],
    ).toHaveLength(1);
    expect(
      (await database().query('SELECT * FROM task_quotation_links'))[0],
    ).toHaveLength(1);
  } finally {
    await database().query(
      'DROP TRIGGER reject_clone ON quotation_clone_commands; DROP FUNCTION reject_clone()',
    );
  }
  const result = await service().cloneRecommended(
    sourceId,
    command,
    fixture.actor,
  );
  expect(result.number.slice(-3)).toBe('002');
});
it('selects exact target beyond 100 closer General items and applies actor usage before preference with stable SKU ties', async (): Promise<void> => {
  const sourceId = await seedSource();
  await Promise.all(
    Array.from({ length: 110 }, (_, index): Promise<CatalogueItem> =>
      seedCatalogue(
        randomUUID(),
        CLONE_TEST_BRAND.GENERAL,
        `${CLONE_TEST_SKU.GENERAL}-${index}`,
      ),
    ),
  );
  const preferred = await seedCatalogue(
    randomUUID(),
    CLONE_TEST_BRAND.TARGET,
    CLONE_TEST_SKU.FIRST,
    {
      preference: CATALOGUE_PREFERENCE.USED,
    },
  );
  await database().query(
    'INSERT INTO catalogue_item_usage VALUES ($id,$userId,2,NULL)',
    { bind: { id: targetCatalogueId, userId: fixture.actor.id } },
  );
  const result = await service().cloneRecommended(
    sourceId,
    input(),
    fixture.actor,
  );
  expect(
    result.sections
      .flatMap((section): IQuotationItem[] => section.items)
      .find((item): boolean => item.sku === CLONE_TEST_SKU.TARGET)
      ?.catalogueItemId,
  ).toBe(targetCatalogueId);
  await database().query('TRUNCATE catalogue_item_usage');
  const next = await service().cloneRecommended(
    sourceId,
    input(),
    fixture.actor,
  );
  expect(
    next.sections
      .flatMap((section): IQuotationItem[] => section.items)
      .some((item): boolean => item.catalogueItemId === preferred.id),
  ).toBe(true);
});
it('returns actionable public SKU reasons for missing replacements without creating partial drafts', async (): Promise<void> => {
  const sourceId = await seedSource();
  await CatalogueItem.update(
    { status: CATALOGUE_STATUS.ARCHIVED },
    { where: { id: targetCatalogueId } },
  );
  try {
    await service().cloneRecommended(sourceId, input(), fixture.actor);
    throw new Error('Expected mapping failure');
  } catch (error) {
    expect(getHttpErrorResponse(error)).toMatchObject({
      statusCode: HttpStatus.BAD_REQUEST,
      code: HTTP_ERROR_CODES.QUOTATION_CLONE_MAPPING_FAILED,
      safeResponse: {
        issues: [expect.objectContaining({ sku: CLONE_TEST_SKU.SOURCE })],
      },
    });
  }
  expect((await database().query('SELECT * FROM quotations'))[0]).toHaveLength(
    1,
  );
});
it('preserves original task primary when cloning a secondary and uses current rules and prices', async (): Promise<void> => {
  const sourceId = await seedSource();
  const secondary = await service().cloneRecommended(
    sourceId,
    input(),
    fixture.actor,
  );
  await CatalogueItem.update(
    { price: '333' },
    { where: { id: sourceCatalogueId } },
  );
  await QuotationRule.update(
    { version: 2 },
    { where: { key: QUOTATION_RULE.ZERO_PRICE } },
  );
  const third = await service().cloneRecommended(
    secondary.id,
    { ...input(), targetBrand: CLONE_TEST_BRAND.SOURCE },
    fixture.actor,
  );
  expect(
    third.ruleConfiguration.find(
      (rule): boolean => rule.key === QUOTATION_RULE.ZERO_PRICE,
    )?.version,
  ).toBe(2);
  expect(third.taskLinks).toEqual(secondary.taskLinks);
  expect(
    third.sections
      .flatMap((section): IQuotationItem[] => section.items)
      .some(
        (item): boolean =>
          item.sku === CLONE_TEST_SKU.SOURCE && item.quotedPrice === '333.0000',
      ),
  ).toBe(true);
  const [primary] = await database().query<{ quotation_id: string }>(
    'SELECT quotation_id FROM task_quotation_links WHERE is_primary',
    { type: QueryTypes.SELECT },
  );
  expect(primary.quotation_id).toBe(sourceId);
});
it.each([0, null])(
  'does not require positive target capacity for a %s-capacity source and resolves ties by SKU then ID',
  async (capacity): Promise<void> => {
    const sourceId = await seedSource();
    await QuotationItem.update(
      { capacityBtu: capacity },
      { where: { catalogueItemId: sourceCatalogueId } },
    );
    await CatalogueItem.update(
      { capacityBtu: null },
      { where: { id: targetCatalogueId } },
    );
    const lowerId = '00000000-0000-4000-8000-000000000001';
    await seedCatalogue(
      '00000000-0000-4000-8000-000000000002',
      CLONE_TEST_BRAND.TARGET,
      CLONE_TEST_SKU.FIRST,
      { capacityBtu: null },
    );
    await seedCatalogue(
      lowerId,
      CLONE_TEST_BRAND.TARGET,
      CLONE_TEST_SKU.FIRST,
      { capacityBtu: 0 },
    );
    const result = await service().cloneRecommended(
      sourceId,
      input(),
      fixture.actor,
    );
    expect(
      result.sections
        .flatMap((section): IQuotationItem[] => section.items)
        .find((item): boolean => item.sku === CLONE_TEST_SKU.FIRST)
        ?.catalogueItemId,
    ).toBe(lowerId);
  },
);
it('uses capacity distance before actor usage and allows archived source snapshots', async (): Promise<void> => {
  const sourceId = await seedSource();
  const farther = await seedCatalogue(
    randomUUID(),
    CLONE_TEST_BRAND.TARGET,
    CLONE_TEST_SKU.FIRST,
    {
      capacityBtu: 24000,
    },
  );
  await CatalogueItem.update(
    { status: CATALOGUE_STATUS.ARCHIVED },
    { where: { id: sourceCatalogueId } },
  );
  await database().query(
    'INSERT INTO catalogue_item_usage VALUES ($id,$userId,100,NULL)',
    { bind: { id: farther.id, userId: fixture.actor.id } },
  );
  const result = await service().cloneRecommended(
    sourceId,
    input(),
    fixture.actor,
  );
  expect(
    result.sections
      .flatMap((section): IQuotationItem[] => section.items)
      .some((item): boolean => item.catalogueItemId === targetCatalogueId),
  ).toBe(true);
});
it.each(Object.values(CLONE_TEST_SCENARIO))(
  'rejects %s without command or draft',
  async (kind): Promise<void> => {
    const sourceId = await seedSource();
    const changes: Record<string, () => Promise<void>> = {
      [CLONE_TEST_SCENARIO.MISSING_SOURCE]: async (): Promise<void> => {
        await CatalogueItem.destroy({ where: { id: sourceCatalogueId } });
      },
      [CLONE_TEST_SCENARIO.MULTI_BRAND]: async (): Promise<void> => {
        await database().query(
          'UPDATE quotations SET brands=$brands WHERE id=$id',
          {
            bind: {
              id: sourceId,
              brands: JSON.stringify([
                CLONE_TEST_BRAND.SOURCE,
                CLONE_TEST_BRAND.OTHER,
              ]),
            },
          },
        );
      },
      [CLONE_TEST_SCENARIO.GENERAL_ONLY]: async (): Promise<void> => {
        await database().query(
          'UPDATE quotations SET brands=$brands,brand=$brand WHERE id=$id',
          {
            bind: {
              id: sourceId,
              brands: JSON.stringify([]),
              brand: CLONE_TEST_BRAND.GENERAL,
            },
          },
        );
      },
      [CLONE_TEST_SCENARIO.CONTRADICTORY_SOURCE]: async (): Promise<void> => {
        await CatalogueItem.update(
          { brand: CLONE_TEST_BRAND.OTHER },
          { where: { id: sourceCatalogueId } },
        );
      },
      [CLONE_TEST_SCENARIO.INVALID_ACCESSORY]: async (): Promise<void> => {
        const items = await QuotationItem.findAll({
          where: { catalogueItemId: sourceCatalogueId },
        });
        await QuotationItem.update(
          { parentItemId: items[0].id },
          { where: { catalogueItemId: generalCatalogueId } },
        );
      },
    };
    await changes[kind]();
    await expect(
      service().cloneRecommended(sourceId, input(), fixture.actor),
    ).rejects.toThrow();
    expect(
      (await database().query('SELECT * FROM quotation_clone_commands'))[0],
    ).toHaveLength(0);
    expect(
      (await database().query('SELECT * FROM quotations'))[0],
    ).toHaveLength(1);
  },
);
it('fails an incompatible first-ranked accessory combination instead of silently selecting another unit', async (): Promise<void> => {
  const sourceId = await seedSource();
  await CatalogueItem.update(
    { equipmentRole: EQUIPMENT_ROLE.INDOOR },
    { where: { id: sourceCatalogueId } },
  );
  await CatalogueItem.update(
    { equipmentRole: EQUIPMENT_ROLE.INDOOR, includesRemote: true },
    { where: { id: targetCatalogueId } },
  );
  await QuotationItem.update(
    { equipmentRole: EQUIPMENT_ROLE.INDOOR },
    { where: { catalogueItemId: sourceCatalogueId } },
  );
  const sourceUnit = await QuotationItem.findOne({
    where: { catalogueItemId: sourceCatalogueId },
  });
  const remoteSource = await seedCatalogue(
    randomUUID(),
    CLONE_TEST_BRAND.SOURCE,
    CLONE_TEST_SKU.REMOTE_SOURCE,
    {
      equipmentRole: EQUIPMENT_ROLE.CONTROL,
      description: 'שלט מקור',
      capacityBtu: null,
    },
  );
  await seedCatalogue(
    randomUUID(),
    CLONE_TEST_BRAND.TARGET,
    CLONE_TEST_SKU.REMOTE_TARGET,
    {
      equipmentRole: EQUIPMENT_ROLE.CONTROL,
      description: 'שלט יעד',
      capacityBtu: null,
    },
  );
  await seedCatalogue(
    randomUUID(),
    CLONE_TEST_BRAND.TARGET,
    CLONE_TEST_SKU.COMPATIBLE,
    {
      equipmentRole: EQUIPMENT_ROLE.INDOOR,
      includesRemote: false,
    },
  );
  if (!sourceUnit) {
    throw new Error('Source unit missing');
  }
  await QuotationItem.create({
    ...quotationItemFixture(),
    id: randomUUID(),
    sectionId: sourceUnit.sectionId,
    catalogueItemId: remoteSource.id,
    parentItemId: sourceUnit.id,
    sku: CLONE_TEST_SKU.REMOTE_SOURCE,
    quantity: '3',
    equipmentRole: EQUIPMENT_ROLE.CONTROL,
    equipmentType: null,
    capacityBtu: null,
    controlKind: CONTROL_KIND.REMOTE,
  });
  await expect(
    service().cloneRecommended(sourceId, input(), fixture.actor),
  ).rejects.toThrow('לא ניתן ליצור');
  expect((await database().query('SELECT * FROM quotations'))[0]).toHaveLength(
    1,
  );
});
it('returns stale source code and rejects unavailable project/customer contexts', async (): Promise<void> => {
  const sourceId = await seedSource();
  try {
    await service().cloneRecommended(
      sourceId,
      { ...input(), sourceVersion: 2 },
      fixture.actor,
    );
    throw new Error('Expected stale source');
  } catch (error) {
    expect(getHttpErrorResponse(error)).toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: HTTP_ERROR_CODES.QUOTATION_CLONE_SOURCE_CHANGED,
    });
  }
  await database().query('UPDATE projects SET deleted_at=now() WHERE id=$id', {
    bind: { id: fixture.projectId },
  });
  try {
    await expect(
      service().cloneRecommended(sourceId, input(), fixture.actor),
    ).rejects.toThrow();
  } finally {
    await database().query('UPDATE projects SET deleted_at=NULL WHERE id=$id', {
      bind: { id: fixture.projectId },
    });
  }
});

it('serves the new HTTP command with 201 including replay and retains guard/body validation', async (): Promise<void> => {
  const sourceId = await seedSource();
  const authorization = mock<AuthService>();
  authorization.authenticate.mockResolvedValue(fixture.actor);
  const module = await Test.createTestingModule({
    controllers: [QuotationController],
    providers: [
      { provide: QuotationService, useValue: service() },
      { provide: QuotationPdfService, useValue: mock<QuotationPdfService>() },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalGuards(new AuthGuard(new Reflector(), authorization));
  await app.listen(0, '127.0.0.1');
  const url = `${await app.getUrl()}/quotation/${sourceId}/clone-recommended`;
  const command = input();
  const execute = promisify(execFile);
  try {
    const request = [
      '--silent',
      '--show-error',
      '--write-out',
      '\n%{http_code}',
      '--request',
      'POST',
      '--header',
      'Authorization: Bearer fixture-session',
      '--header',
      'Content-Type: application/json',
      '--data',
      JSON.stringify(command),
      url,
    ];
    const first = await execute('curl', request);
    const replay = await execute('curl', request);
    expect(first.stdout).toContain(`"status":"${QUOTATION_STATUS.DRAFT}"`);
    expect(first.stdout.slice(-3)).toBe(String(HttpStatus.CREATED));
    expect(replay.stdout).toBe(first.stdout);
    const rejected = await execute('curl', [
      '--silent',
      '--write-out',
      '%{http_code}',
      '--request',
      'POST',
      url,
    ]);
    expect(rejected.stdout.slice(-3)).toBe(String(HttpStatus.UNAUTHORIZED));
    const invalid = await execute('curl', [
      '--silent',
      '--write-out',
      '%{http_code}',
      '--request',
      'POST',
      '--header',
      'Authorization: Bearer fixture-session',
      '--header',
      'Content-Type: application/json',
      '--data',
      JSON.stringify({ ...command, idempotencyKey: 'invalid' }),
      url,
    ]);
    expect(invalid.stdout.slice(-3)).toBe(String(HttpStatus.BAD_REQUEST));
  } finally {
    await app.close();
  }
});
it('retains command history privately with restrictive actor and result foreign keys', async (): Promise<void> => {
  const sourceId = await seedSource();
  const result = await service().cloneRecommended(
    sourceId,
    input(),
    fixture.actor,
  );
  const [privacy] = await database().query<{ protected: boolean }>(
    "SELECT relrowsecurity AND NOT has_table_privilege('anon','quotation_clone_commands','SELECT') AND NOT has_table_privilege('authenticated','quotation_clone_commands','SELECT') AS protected FROM pg_class WHERE oid='quotation_clone_commands'::regclass",
    { type: QueryTypes.SELECT },
  );
  expect(privacy.protected).toBe(true);
  await expect(
    database().query('DELETE FROM users WHERE id=$id', {
      bind: { id: fixture.actor.id },
    }),
  ).rejects.toThrow();
  await expect(
    database().query('DELETE FROM quotations WHERE id=$id', {
      bind: { id: result.id },
    }),
  ).rejects.toThrow();
});

it('reopens a committed readable result after source/customer/project retirement without rerunning creation availability checks', async (): Promise<void> => {
  const sourceId = await seedSource();
  const command = input();
  const first = await service().cloneRecommended(
    sourceId,
    command,
    fixture.actor,
  );
  await database().query(
    'UPDATE quotations SET deleted_at=now() WHERE id=$id',
    { bind: { id: sourceId } },
  );
  await database().query('UPDATE projects SET deleted_at=now() WHERE id=$id', {
    bind: { id: fixture.projectId },
  });
  await database().query('UPDATE customers SET deleted_at=now() WHERE id=$id', {
    bind: { id: fixture.customerId },
  });
  try {
    expect(
      (await service().cloneRecommended(sourceId, command, fixture.actor)).id,
    ).toBe(first.id);
    await expect(
      service().cloneRecommended(sourceId, command, {
        ...fixture.actor,
        permissions: [],
      }),
    ).rejects.toThrow('permission');
  } finally {
    await database().query('UPDATE projects SET deleted_at=NULL WHERE id=$id', {
      bind: { id: fixture.projectId },
    });
    await database().query(
      'UPDATE customers SET deleted_at=NULL WHERE id=$id',
      { bind: { id: fixture.customerId } },
    );
  }
});
