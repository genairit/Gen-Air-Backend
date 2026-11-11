import {
  quotationItemFixture,
  quotationDocumentFixture,
} from '../../testing/quotation.fixture';

import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import { QuotationService } from './quotation.service';
import type { UserService } from '@Modules/user/user.service';
import type { QuotationRepository } from './quotation.repository';
import type { ProjectService } from '@Modules/project/project.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { CustomerService } from '@Modules/customer/customer.service';
import type { UserRoleService } from '@Modules/user-role/user-role.service';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import type { QuotationSelectionService } from './quotation-selection.service';
import type { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import type { QuotationItemService } from '@Modules/quotation-item/quotation-item.service';
import type { QuotationRuleService } from '@Modules/quotation-rule/quotation-rule.service';
import type { CatalogueItem } from '@Modules/catalogue-item/entities/catalogue-item.entity';
import type { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import type { QuotationSectionService } from '@Modules/quotation-section/quotation-section.service';
import type { QuotationProjectService } from '@Modules/quotation-project/quotation-project.service';

const customerId = randomUUID();
const sourceId = randomUUID();
const projectId = randomUUID();
const generalCatalogueId = randomUUID();
const sourceCatalogueId = randomUUID();
const targetCatalogueId = randomUUID();
const apartmentId = randomUUID();
const generalLine = {
  ...quotationItemFixture(),
  id: randomUUID(),
  catalogueItemId: generalCatalogueId,
  sku: 'G1',
  description: 'General snapshot',
  quotedPrice: '55',
  quantity: '2',
  equipmentRole: 'other',
};
const brandLine = {
  ...quotationItemFixture(),
  id: randomUUID(),
  catalogueItemId: sourceCatalogueId,
  sku: 'E1',
  quotedPrice: '100',
  quantity: '3',
  equipmentType: 'wall',
  capacityBtu: 12000,
};
const source = quotationDocumentFixture([]);
source.id = sourceId;
source.customerId = customerId;
source.projectId = projectId;
source.version = 3;
source.paymentTermsNote = 'paid later';
source.sections = [
  {
    ...source.sections[0],
    id: randomUUID(),
    brand: null,
    systemType: 'GEN',
    items: [generalLine],
    displayOrder: 0,
  },
  {
    ...source.sections[0],
    id: randomUUID(),
    brand: 'אלקטרה',
    systemType: 'SINGLE',
    items: [brandLine],
    displayOrder: 1,
  },
];
const input = {
  sourceVersion: 3,
  targetBrand: 'תדיראן',
  mappings: [
    { sourceLineId: brandLine.id, targetCatalogueItemId: targetCatalogueId },
  ],
};
const actor = mock<IAuthorizedUser>({
  id: randomUUID(),
  firstName: 'Test',
  lastName: 'User',
});
const catalogueItem = (
  id: string,
  brand: string,
  capacityBtu: number | null = 12000,
) =>
  mock<CatalogueItem>({
    id,
    brand,
    status: 'active',
    equipmentRole: 'unit',
    equipmentTypes: ['floor', 'wall'],
    systemType: 'SINGLE',
    sku: 'T1',
    description: 'Target unit',
    price: '120',
    unit: 'unit',
    capacityBtu,
    includesRemote: false,
    includesThermostat: false,
    preference: '',
  });

const setup = () => {
  const repository = mock<QuotationRepository>();
  const rules = mock<QuotationRuleService>();
  const sections = mock<QuotationSectionService>();
  const items = mock<QuotationItemService>();
  const catalogue = mock<CatalogueItemService>();
  const selection = mock<QuotationSelectionService>();
  const customers = mock<CustomerService>();
  const projects = mock<ProjectService>();
  const links = mock<QuotationProjectService>();
  const transactions = mock<DatabaseTransactionService>();
  const users = mock<UserService>();
  const userRoles = mock<UserRoleService>();
  const transaction = mock<Transaction>();
  const service = new QuotationService(
    repository,
    rules,
    sections,
    items,
    catalogue,
    selection,
    customers,
    projects,
    links,
    transactions,
    users,
    userRoles,
  );
  jest.spyOn(service, 'document').mockResolvedValue(source);
  jest.spyOn(service, 'getById').mockResolvedValue(mock({ id: randomUUID() }));
  transactions.run.mockImplementation((work) => work(transaction));
  repository.nextNumber.mockResolvedValue('2611-001');
  rules.configuration.mockResolvedValue({
    rules: source.ruleConfiguration,
    fingerprint: source.ruleConfigFingerprint,
  });
  projects.getById.mockResolvedValue(mock({ customerId }));
  links.apartmentLinks.mockResolvedValue(
    new Map([[sourceId, [mock({ apartmentId })]]]),
  );
  catalogue.getByIds
    .mockResolvedValueOnce([
      catalogueItem(generalCatalogueId, ''),
      catalogueItem(sourceCatalogueId, 'אלקטרה'),
    ])
    .mockResolvedValueOnce([catalogueItem(targetCatalogueId, 'תדיראן')]);
  return { service, repository, sections, items, catalogue, links };
};

describe('QuotationService.clone', () => {
  it('creates a new draft with General snapshots, reviewed target, and apartment links', async () => {
    const { service, repository, items, links } = setup();
    await service.clone(sourceId, input, actor);
    expect(repository.create.mock.calls[0][0]).toMatchObject({
      brand: 'תדיראן',
      brands: ['תדיראן'],
      status: 'draft',
      discountPercent: '0',
      customerId,
      paymentTermsNote: 'paid later',
      approvedAt: null,
      approvedById: null,
    });
    expect(items.insert.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sku: 'G1',
          description: 'General snapshot',
          quotedPrice: '55',
          quantity: '2',
        }),
        expect.objectContaining({
          sku: 'T1',
          description: 'Target unit',
          quotedPrice: '120',
          quantity: '3',
          equipmentType: 'wall',
        }),
      ]),
    );
    expect(links.replacePrimary.mock.calls[0][1]).toBe(projectId);
    expect(links.replaceApartmentLinks.mock.calls[0][1]).toEqual([apartmentId]);
  });

  it.each([
    [
      'unsupported brand',
      { ...input, targetBrand: 'Unknown' },
      BadRequestException,
    ],
    ['missing mapping', { ...input, mappings: [] }, BadRequestException],
    [
      'foreign mapping',
      {
        ...input,
        mappings: [
          {
            sourceLineId: randomUUID(),
            targetCatalogueItemId: targetCatalogueId,
          },
        ],
      },
      BadRequestException,
    ],
    ['stale version', { ...input, sourceVersion: 2 }, ConflictException],
  ])('rejects %s before creating a draft', async (_name, request, error) => {
    const { service, repository } = setup();
    await expect(service.clone(sourceId, request, actor)).rejects.toThrow(
      error,
    );
    expect(repository.create.mock.calls).toHaveLength(0);
  });

  it('rejects a target catalogue item from another brand', async () => {
    const { service, repository, catalogue } = setup();
    catalogue.getByIds
      .mockReset()
      .mockResolvedValueOnce([
        catalogueItem(generalCatalogueId, ''),
        catalogueItem(sourceCatalogueId, 'אלקטרה'),
      ])
      .mockResolvedValueOnce([catalogueItem(targetCatalogueId, 'LG')]);
    await expect(service.clone(sourceId, input, actor)).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.create.mock.calls).toHaveLength(0);
  });

  it.each([0, null])(
    'rejects a %s-capacity replacement for a sized source unit',
    async (capacity) => {
      const { service, repository, catalogue } = setup();
      catalogue.getByIds
        .mockReset()
        .mockResolvedValueOnce([
          catalogueItem(generalCatalogueId, ''),
          catalogueItem(sourceCatalogueId, 'אלקטרה'),
        ])
        .mockResolvedValueOnce([
          catalogueItem(targetCatalogueId, 'תדיראן', capacity),
        ]);
      await expect(service.clone(sourceId, input, actor)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.create.mock.calls).toHaveLength(0);
    },
  );

  it('rejects a multi-brand source', async () => {
    const { service, repository } = setup();
    jest
      .spyOn(service, 'document')
      .mockResolvedValue({ ...source, brands: ['אלקטרה', 'LG'] });
    await expect(service.clone(sourceId, input, actor)).rejects.toThrow(
      BadRequestException,
    );
    expect(repository.create.mock.calls).toHaveLength(0);
  });
});
