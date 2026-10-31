import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Sequelize } from 'sequelize-typescript';
import { setTimeout as wait } from 'node:timers/promises';
import { ProjectService } from '@Modules/project/project.service';
import { ProviderNames } from '@Providers/database/provider-names';
import { CustomerService } from '@Modules/customer/customer.service';
import { QuotationService } from '@Modules/quotation/quotation.service';
import { Quotation } from '@Modules/quotation/entities/quotation.entity';
import { QuotationRepository } from '@Modules/quotation/quotation.repository';
import type { SaveQuotationDto } from '@Modules/quotation/dto/save-quotation.dto';
import { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import { QuotationItem } from '@Modules/quotation-item/entities/quotation-item.entity';
import { CatalogueItem } from '@Modules/catalogue-item/entities/catalogue-item.entity';
import { QuotationRule } from '@Modules/quotation-rule/entities/quotation-rule.entity';
import { QuotationSelectionService } from '@Modules/quotation/quotation-selection.service';
import { QuotationItemRepository } from '@Modules/quotation-item/quotation-item.repository';
import { CatalogueItemRepository } from '@Modules/catalogue-item/catalogue-item.repository';
import { QuotationRuleRepository } from '@Modules/quotation-rule/quotation-rule.repository';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';
import { QuotationSection } from '@Modules/quotation-section/entities/quotation-section.entity';
import type { IQuotationView } from '@Modules/quotation/interfaces/quotation-document.interface';
import { QuotationSectionRepository } from '@Modules/quotation-section/quotation-section.repository';
import { CatalogueItemUsageService } from '@Modules/catalogue-item-usage/catalogue-item-usage.service';
import { CatalogueItemUsage } from '@Modules/catalogue-item-usage/entities/catalogue-item-usage.entity';
import { CatalogueItemUsageRepository } from '@Modules/catalogue-item-usage/catalogue-item-usage.repository';

const actor = randomUUID(),
  otherActor = randomUUID(),
  customerId = randomUUID();
const customer = { id: customerId, paymentTerms: 'prepaid' };
const databaseUrl = process.env.QUOTATION_TEST_DATABASE_URL;
if (!databaseUrl || !databaseUrl.includes('127.0.0.1')) {
  throw new Error('Disposable local QUOTATION_TEST_DATABASE_URL required');
}
const sequelize = new Sequelize(databaseUrl, {
  logging: false,
  define: { underscored: true, timestamps: true },
  models: [
    Quotation,
    QuotationSection,
    QuotationItem,
    CatalogueItem,
    CatalogueItemUsage,
    QuotationRule,
  ],
});
const providers = [
  QuotationService,
  QuotationSelectionService,
  QuotationRepository,
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
  { provide: ProviderNames.SEQUELIZE, useValue: sequelize },
  {
    provide: CustomerService,
    useValue: { getById: () => Promise.resolve(customer) },
  },
  {
    provide: ProjectService,
    useValue: { getById: (id: string) => Promise.resolve({ id, customerId }) },
  },
];
const context = Test.createTestingModule({ providers });
const services: {
  quotation: QuotationService | null;
  catalogue: CatalogueItemService | null;
  sections: QuotationSectionService | null;
  usage: CatalogueItemUsageService | null;
} = { quotation: null, catalogue: null, sections: null, usage: null };
const quotationService = () => {
  if (!services.quotation) {
    throw new Error('Test context unavailable');
  }
  return services.quotation;
};
const catalogueService = () => {
  if (!services.catalogue) {
    throw new Error('Test context unavailable');
  }
  return services.catalogue;
};
const itemAttributes = (changes: Partial<CatalogueItem> = {}) => ({
  id: randomUUID(),
  sku: randomUUID(),
  description: 'ציוד בדיקה',
  unit: 'יח׳',
  price: '10.0050',
  capacityBtu: 24000,
  brand: 'אלקטרה',
  systemType: 'SINGLE',
  equipmentRole: 'unit',
  equipmentTypes: [],
  status: 'active',
  preference: '',
  includesRemote: false,
  includesThermostat: false,
  ...changes,
});
const payload = (quotation: IQuotationView): SaveQuotationDto => ({
  version: quotation.version,
  customerId: quotation.customerId,
  projectId: quotation.projectId,
  date: quotation.date,
  brand: 'אלקטרה',
  paymentTerms: quotation.paymentTerms,
  paymentTermsNote: quotation.paymentTermsNote,
  paymentSchedule: quotation.paymentSchedule,
  discountPercent: quotation.discountPercent,
  targetPretaxAmount: quotation.targetPretaxAmount,
  internalNotes: quotation.internalNotes,
  sections: quotation.sections.map((section) => ({
    id: section.id,
    title: section.title,
    systemType: section.systemType,
    items: section.items.map((item) => ({
      id: item.id,
      catalogueItemId: item.catalogueItemId,
      parentItemId: item.parentItemId,
      description: item.description,
      quotedPrice: item.quotedPrice,
      quantity: item.quantity,
      location: item.location,
      circuit: item.circuit,
      requestedCapacityBtu: item.requestedCapacityBtu,
    })),
  })),
});
const withLine = async (
  changes: Partial<CatalogueItem> = {},
): Promise<{ quote: IQuotationView; catalogue: CatalogueItem }> => {
  const catalogue = await CatalogueItem.create(itemAttributes(changes));
  const quote = await quotationService().create({ customerId }, actor);
  const input = payload(quote);
  input.sections = [
    {
      id: randomUUID(),
      title: 'קומה1',
      systemType: 'GEN',
      items: [
        {
          id: randomUUID(),
          catalogueItemId: catalogue.id,
          parentItemId: null,
          description: catalogue.description,
          quotedPrice: catalogue.price,
          quantity: '1',
          location: 'סלון',
          circuit: null,
          requestedCapacityBtu: null,
        },
      ],
    },
  ];
  return {
    quote: await quotationService().save(quote.id, input, actor),
    catalogue,
  };
};
beforeAll(async () => {
  await sequelize.authenticate();
  await sequelize.query(
    `CREATE TYPE user_role AS ENUM('system_admin','engineer');CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE customers(id uuid PRIMARY KEY,name text DEFAULT 'לקוח בדיקה');CREATE TABLE projects(id uuid PRIMARY KEY,name text DEFAULT 'פרויקט בדיקה');CREATE TABLE permissions(key text PRIMARY KEY,feature text,action text);CREATE TABLE role_permissions(role user_role,permission_key text,PRIMARY KEY(role,permission_key));INSERT INTO permissions VALUES('projects.read','projects','read');INSERT INTO role_permissions VALUES('system_admin','projects.read'),('engineer','projects.read');`,
  );
  await sequelize.query('INSERT INTO users(id) VALUES($actor),($otherActor)', {
    bind: { actor, otherActor },
  });
  await sequelize.query('INSERT INTO customers(id) VALUES($customerId)', {
    bind: { customerId },
  });
  await sequelize.query(
    await readFile(
      join(
        process.cwd(),
        'migrations/2026-10-31-quotation-builder-catalogue.sql',
      ),
      'utf8',
    ),
  );
  const module = await context.compile();
  services.quotation = module.get(QuotationService);
  services.catalogue = module.get(CatalogueItemService);
  services.sections = module.get(QuotationSectionService);
  services.usage = module.get(CatalogueItemUsageService);
}, 30000);
afterAll(async () => {
  await sequelize.close();
});

describe('Quotation aggregate on real PostgreSQL', () => {
  test('customer-first creation persists defaults and empty note; no project required', async () => {
    const quote = await quotationService().create({ customerId }, actor);
    expect(quote).toMatchObject({
      customerId,
      projectId: null,
      paymentTerms: 'prepaid',
      paymentTermsNote: '',
      version: 1,
      status: 'draft',
    });
    customer.paymentTerms = 'other';
    expect((await quotationService().getById(quote.id)).paymentTerms).toBe(
      'prepaid',
    );
    customer.paymentTerms = 'prepaid';
  });
  test('concurrent creation allocates different numbers', async () => {
    const quotes = await Promise.all([
      quotationService().create({ customerId }, actor),
      quotationService().create({ customerId }, actor),
    ]);
    expect(new Set(quotes.map((quote) => quote.number)).size).toBe(2);
  });
  test('quoted values and repeated lines survive catalogue edits and reload', async () => {
    const { quote, catalogue } = await withLine();
    const input = payload(quote);
    const line = input.sections[0].items[0];
    input.sections[0].items.push({
      ...line,
      id: randomUUID(),
      location: 'מטבח',
    });
    const saved = await quotationService().save(quote.id, input, actor);
    await CatalogueItem.update(
      { price: '999', description: 'מחירון השתנה' },
      { where: { id: catalogue.id } },
    );
    const fetched = await quotationService().getById(saved.id);
    expect(fetched.sections[0].items).toHaveLength(2);
    expect(fetched.sections[0].items[0]).toMatchObject({
      description: 'ציוד בדיקה',
      quotedPrice: '10.0050',
      location: 'סלון',
    });
    expect(fetched.totals.subtotal).toBe('20.02');
  });
  test('percentage, target precedence, zero target, VAT and half-up rounding authoritative', async () => {
    const { quote } = await withLine();
    expect(quote.totals).toMatchObject({
      subtotal: '10.01',
      pretax: '10.01',
      vat: '1.80',
      total: '11.81',
    });
    const input = { ...payload(quote), discountPercent: '10' };
    const discounted = await quotationService().save(quote.id, input, actor);
    expect(discounted.totals.pretax).toBe('9.01');
    const target = await quotationService().save(
      quote.id,
      { ...payload(discounted), targetPretaxAmount: '7.00' },
      actor,
    );
    expect(target.totals.total).toBe('8.26');
    const zero = await quotationService().save(
      quote.id,
      { ...payload(target), targetPretaxAmount: '0' },
      actor,
    );
    expect(zero.totals.total).toBe('0.00');
  });
  test('concurrent saves produce one success, one domain409 and no lost update', async () => {
    const { quote } = await withLine();
    const input = payload(quote);
    const outcomes = await Promise.allSettled([
      quotationService().save(
        quote.id,
        { ...input, internalNotes: 'one' },
        actor,
      ),
      quotationService().save(
        quote.id,
        { ...input, internalNotes: 'two' },
        otherActor,
      ),
    ]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failed = outcomes.find((result) => result.status === 'rejected');
    expect(failed).toMatchObject({
      status: 'rejected',
      reason: { status: 409 },
    });
    expect((await quotationService().getById(quote.id)).version).toBe(
      quote.version + 1,
    );
  });
  test('archived catalogue items remain on existing lines but cannot be newly selected', async () => {
    const { quote, catalogue } = await withLine();
    await catalogueService().update(catalogue.id, { status: 'archived' });
    const preserved = await quotationService().save(
      quote.id,
      payload(quote),
      actor,
    );
    expect(preserved.sections[0].items[0].catalogueItemId).toBe(catalogue.id);
    const input = payload(preserved);
    input.sections[0].items.push({
      ...input.sections[0].items[0],
      id: randomUUID(),
    });
    await expect(
      quotationService().save(quote.id, input, actor),
    ).rejects.toMatchObject({ status: 400 });
  });
  test('usage counts new selections once, not autosaves, and isolates actors', async () => {
    const { quote, catalogue } = await withLine();
    await quotationService().save(quote.id, payload(quote), actor);
    const usage = await CatalogueItemUsage.findOne({
      where: { userId: actor, catalogueItemId: catalogue.id },
    });
    expect(usage?.selectionCount).toBe(1);
    expect(
      await CatalogueItemUsage.count({
        where: { userId: otherActor, catalogueItemId: catalogue.id },
      }),
    ).toBe(0);
  });
  test('incompatible and unavailable items never enter suggestions despite personal usage', async () => {
    const { catalogue } = await withLine({
      systemType: 'VRF',
      equipmentRole: 'indoor',
    });
    const results = await catalogueService().search(
      { systemType: 'SINGLE', search: catalogue.sku },
      actor,
    );
    expect(results).toEqual([]);
    await catalogueService().update(catalogue.id, { status: 'nosell' });
    expect(
      await catalogueService().search({ search: catalogue.sku }, actor),
    ).toEqual([]);
  });
  test('duplicate SKU conflicts require explicit winner and cannot both activate', async () => {
    const sku = randomUUID();
    const a = await CatalogueItem.create(
      itemAttributes({ sku, status: 'conflict' }),
    );
    const b = await CatalogueItem.create(
      itemAttributes({ sku, status: 'conflict' }),
    );
    expect(await catalogueService().search({ search: sku }, actor)).toEqual([]);
    const outcomes = await Promise.allSettled([
      catalogueService().update(a.id, { status: 'active' }),
      catalogueService().update(b.id, { status: 'active' }),
    ]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { status: 409 } });
  });
  test('zero price is a required warning: review blocks approval until acknowledged; self approval allowed', async () => {
    const { quote } = await withLine({ price: '0' });
    expect(
      quote.warnings.some((warning) => warning.text.includes('מחיר 0')),
    ).toBe(true);
    const review = await quotationService().transition(
      quote.id,
      { version: quote.version, status: 'review' },
      actor,
    );
    await expect(
      quotationService().transition(
        quote.id,
        { version: review.version, status: 'approved' },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const acknowledged = await quotationService().acknowledge(
      quote.id,
      {
        version: review.version,
        warningKeys: review.warnings.map((warning) => warning.key),
      },
      actor,
    );
    const approved = await quotationService().transition(
      quote.id,
      { version: acknowledged.version, status: 'approved' },
      actor,
    );
    expect(approved.approvedById).toBe(actor);
    await expect(
      quotationService().save(approved.id, payload(approved), actor),
    ).rejects.toMatchObject({ status: 409 });
    const reopened = await quotationService().transition(
      quote.id,
      { version: approved.version, status: 'draft' },
      actor,
    );
    expect(reopened.id).toBe(approved.id);
  });
  test('rule changes invalidate draft acknowledgements and approved quotes retain policy snapshot', async () => {
    const { quote } = await withLine({ price: '0' });
    const acknowledged = await quotationService().acknowledge(
      quote.id,
      {
        version: quote.version,
        warningKeys: quote.warnings.map((warning) => warning.key),
      },
      actor,
    );
    await QuotationRule.update(
      { version: 2 },
      { where: { key: 'zero_price' } },
    );
    const fetched = await quotationService().getById(quote.id);
    expect(fetched.warnings.every((warning) => !warning.acknowledged)).toBe(
      true,
    );
    await expect(
      quotationService().acknowledge(
        quote.id,
        {
          version: acknowledged.version,
          warningKeys: acknowledged.warnings.map((warning) => warning.key),
        },
        actor,
      ),
    ).rejects.toMatchObject({ status: 400 });
    const fresh = await quotationService().acknowledge(
      quote.id,
      {
        version: acknowledged.version,
        warningKeys: fetched.warnings.map((warning) => warning.key),
      },
      actor,
    );
    const review = await quotationService().transition(
      quote.id,
      { version: fresh.version, status: 'review' },
      actor,
    );
    const approved = await quotationService().transition(
      quote.id,
      { version: review.version, status: 'approved' },
      actor,
    );
    await QuotationRule.update(
      { version: 3 },
      { where: { key: 'zero_price' } },
    );
    expect(
      (await quotationService().getById(approved.id)).ruleConfigFingerprint,
    ).toBe(approved.ruleConfigFingerprint);
  });
  test('saving content invalidates acknowledgements and returns to draft', async () => {
    const { quote } = await withLine({ price: '0' });
    const acknowledged = await quotationService().acknowledge(
      quote.id,
      {
        version: quote.version,
        warningKeys: quote.warnings.map((warning) => warning.key),
      },
      actor,
    );
    const saved = await quotationService().save(
      quote.id,
      { ...payload(acknowledged), internalNotes: 'changed' },
      actor,
    );
    expect(saved.acknowledgedWarnings).toEqual([]);
    expect(saved.warnings.every((warning) => !warning.acknowledged)).toBe(true);
  });
  test('unknown catalogue ID cannot create a manual000 line or partial data', async () => {
    const { quote } = await withLine();
    const input = payload(quote);
    input.sections[0].items[0].catalogueItemId = randomUUID();
    await expect(
      quotationService().save(quote.id, input, actor),
    ).rejects.toMatchObject({ status: 400 });
    expect((await quotationService().getById(quote.id)).version).toBe(
      quote.version,
    );
  });
  test('seed keeps five duplicate groups quarantined and zero price selectable', async () => {
    await sequelize.query(
      await readFile(
        join(
          process.cwd(),
          'migrations/2026-10-31-quotation-catalogue-seed.sql',
        ),
        'utf8',
      ),
    );
    expect(
      await CatalogueItem.count({
        where: {
          status: 'conflict',
          sku: [
            'ELVICCI-180A/WS',
            'PEFY-P40VMX-E1',
            'SUN 10 DUCT',
            'SUN 13 DUCT',
            'SUN 19 DUCT',
          ],
        },
      }),
    ).toBe(10);
    expect(
      await CatalogueItem.count({ where: { status: 'nosell' } }),
    ).toBeGreaterThanOrEqual(8);
    expect(
      await CatalogueItem.count({ where: { status: 'active', price: '0' } }),
    ).toBeGreaterThan(0);
  }, 30000);
});

describe('Review regression coverage', () => {
  test('supported large decimal bounds retain cents exactly', async () => {
    const { quote } = await withLine({ price: '123456789012.3456' });
    const input = payload(quote);
    input.sections[0].items[0].quantity = '87654321.4321';
    const saved = await quotationService().save(quote.id, input, actor);
    expect(saved.totals.subtotal).toBe('10821521067063092717.57');
  });
  test('existing line cannot move into an incompatible destination system', async () => {
    const { quote } = await withLine({
      systemType: 'VRF',
      equipmentRole: 'indoor',
    });
    const input = payload(quote);
    input.sections[0].systemType = 'SINGLE';
    await expect(
      quotationService().save(quote.id, input, actor),
    ).rejects.toMatchObject({ status: 400 });
    expect((await quotationService().getById(quote.id)).version).toBe(
      quote.version,
    );
  });
  test('newly nosell draft item is a required warning; approved history retains captured status', async () => {
    const { quote, catalogue } = await withLine();
    await catalogueService().update(catalogue.id, { status: 'nosell' });
    const current = await quotationService().getById(quote.id);
    expect(
      current.warnings.some((warning) => warning.text.includes('לא למכור')),
    ).toBe(true);
    const review = await quotationService().transition(
      quote.id,
      { version: current.version, status: 'review' },
      actor,
    );
    await expect(
      quotationService().transition(
        quote.id,
        { version: review.version, status: 'approved' },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const ack = await quotationService().acknowledge(
      quote.id,
      {
        version: review.version,
        warningKeys: review.warnings.map((warning) => warning.key),
      },
      actor,
    );
    const approved = await quotationService().transition(
      quote.id,
      { version: ack.version, status: 'approved' },
      actor,
    );
    await catalogueService().update(catalogue.id, { status: 'active' });
    const history = await quotationService().getById(approved.id);
    expect(history.sections[0].items[0].catalogueStatus).toBe('nosell');
    expect(
      history.warnings.some((warning) => warning.text.includes('לא למכור')),
    ).toBe(true);
  });
  test('aggregate GET blocks a concurrent save and never mixes parent version with new lines', async () => {
    const { quote } = await withLine();
    const sectionService = services.sections;
    if (!sectionService) {
      throw new Error('Missing section test service');
    }
    const originalRepository = new QuotationSectionRepository();
    const signal: {
      reached: (() => void) | null;
      release: (() => void) | null;
    } = { reached: null, release: null };
    const reached = new Promise<void>((resolve) => {
      signal.reached = resolve;
    });
    const release = new Promise<void>((resolve) => {
      signal.release = resolve;
    });
    const spy = jest
      .spyOn(sectionService, 'list')
      .mockImplementationOnce(async (parentIds, transaction) => {
        signal.reached?.();
        await release;
        return originalRepository.list(parentIds, transaction);
      });
    const reading = quotationService().getById(quote.id);
    await reached;
    const input = payload(quote);
    input.sections[0].items[0].quotedPrice = '20';
    const completed = { value: false };
    const saving = quotationService()
      .save(quote.id, input, actor)
      .then((saved) => {
        completed.value = true;
        return saved;
      });
    try {
      await wait(30);
      expect(completed.value).toBe(false);
    } finally {
      signal.release?.();
      spy.mockRestore();
    }
    const read = await reading;
    const saved = await saving;
    expect(read.version).toBe(quote.version);
    expect(read.sections[0].items[0].quotedPrice).toBe('10.0050');
    expect(saved.version).toBe(quote.version + 1);
  });
  test('cursor pages expose all saved quotations, joined customer search, status and invalid-cursor errors', async () => {
    const a = await quotationService().create({ customerId }, actor),
      b = await quotationService().create({ customerId }, actor);
    const seen = new Set<string>();
    const pages: { cursor: string | null } = { cursor: null };
    do {
      const page = await quotationService().list({
        batchSize: 3,
        ...(pages.cursor ? { batchCursor: pages.cursor } : {}),
      });
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      pages.cursor = page.nextCursor;
    } while (pages.cursor);
    expect(seen.has(a.id) && seen.has(b.id)).toBe(true);
    const customerSearch = await quotationService().list({
      search: 'לקוח בדיקה',
    });
    expect(customerSearch.items.length).toBeGreaterThan(0);
    expect(customerSearch.items[0]).toHaveProperty(
      'customerName',
      'לקוח בדיקה',
    );
    const page = await quotationService().list({ batchSize: 1 });
    expect(page.nextCursor).not.toBeNull();
    if (!page.nextCursor) {
      throw new Error('Expected another page');
    }
    await expect(
      quotationService().list({
        batchCursor: page.nextCursor,
        status: 'draft',
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      quotationService().list({ batchCursor: 'garbage' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('Remaining aggregate write guards', () => {
  test.each(['sections', 'items'])(
    'duplicate%s rejects atomically',
    async (kind) => {
      const { quote } = await withLine();
      const input = payload(quote);
      if (kind === 'sections') {
        input.sections.push({ ...input.sections[0] });
      }
      if (kind === 'items') {
        input.sections[0].items.push({ ...input.sections[0].items[0] });
      }
      await expect(
        quotationService().save(quote.id, input, actor),
      ).rejects.toMatchObject({ status: 400 });
      expect((await quotationService().getById(quote.id)).version).toBe(
        quote.version,
      );
    },
  );
  test('wrong-brand catalogue selection rejects atomically', async () => {
    const { quote } = await withLine();
    await expect(
      quotationService().save(
        quote.id,
        { ...payload(quote), brand: 'תדיראן' },
        actor,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect((await quotationService().getById(quote.id)).brand).toBe('אלקטרה');
  });
  test('wrong project/customer relation and invalid transitions reject without mutation', async () => {
    const { quote } = await withLine();
    await expect(
      quotationService().save(
        quote.id,
        {
          ...payload(quote),
          customerId: randomUUID(),
          projectId: randomUUID(),
        },
        actor,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      quotationService().transition(
        quote.id,
        { version: quote.version, status: 'approved' },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const empty = await quotationService().create({ customerId }, actor);
    await expect(
      quotationService().transition(
        empty.id,
        { version: empty.version, status: 'review' },
        actor,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  test('same actor selecting two items in reverse order across quotations never deadlocks', async () => {
    const a = await CatalogueItem.create(itemAttributes()),
      b = await CatalogueItem.create(itemAttributes());
    const one = await quotationService().create({ customerId }, actor),
      two = await quotationService().create({ customerId }, actor);
    const makeInput = (
      quote: IQuotationView,
      items: CatalogueItem[],
    ): SaveQuotationDto => ({
      ...payload(quote),
      sections: [
        {
          id: randomUUID(),
          title: '',
          systemType: 'GEN',
          items: items.map((item) => ({
            id: randomUUID(),
            catalogueItemId: item.id,
            parentItemId: null,
            description: item.description,
            quotedPrice: item.price,
            quantity: '1',
            location: '',
            circuit: null,
            requestedCapacityBtu: null,
          })),
        },
      ],
    });
    const usage = services.usage;
    if (!usage) {
      throw new Error('Usage test service unavailable');
    }
    const originalRepository = new CatalogueItemUsageRepository();
    const firstCalls = new Set<object>();
    const barrier: { release: (() => void) | null } = { release: null };
    const bothStarted = new Promise<void>((resolve) => {
      barrier.release = resolve;
    });
    const spy = jest
      .spyOn(usage, 'record')
      .mockImplementation(async (userId, catalogueItemId, transaction) => {
        const first = !firstCalls.has(transaction);
        firstCalls.add(transaction);
        if (first) {
          if (firstCalls.size === 2) {
            barrier.release?.();
          }
          await bothStarted;
        }
        await originalRepository.record(userId, catalogueItemId, transaction);
        if (first) {
          await wait(30);
        }
      });
    try {
      const outcomes = await Promise.allSettled([
        quotationService().save(one.id, makeInput(one, [a, b]), actor),
        quotationService().save(two.id, makeInput(two, [b, a]), actor),
      ]);
      expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(
        true,
      );
    } finally {
      spy.mockRestore();
    }
    const counts = await CatalogueItemUsage.findAll({
      where: { userId: actor, catalogueItemId: [a.id, b.id] },
    });
    expect(counts.map((count) => count.selectionCount)).toEqual([2, 2]);
  });
});
