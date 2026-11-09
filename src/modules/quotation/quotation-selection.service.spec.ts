import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import { SYSTEM_TYPE } from './constants/quotation.constant';
import type { SaveQuotationDto } from './dto/save-quotation.dto';
import { QuotationSelectionService } from './quotation-selection.service';
import { quotationDocumentFixture } from '../../testing/quotation.fixture';
import { CatalogueItem } from '@Modules/catalogue-item/entities/catalogue-item.entity';
import type { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import type { ICatalogueItem } from '@Modules/catalogue-item/interfaces/catalogue-item.interface';
import type { CatalogueItemUsageService } from '@Modules/catalogue-item-usage/catalogue-item-usage.service';

const catalogue = (brand: string): ICatalogueItem => ({
  id: randomUUID(),
  sku: randomUUID(),
  unit: 'יח׳',
  price: '100',
  brand,
  status: 'active',
  preference: '',
  description: 'פריט',
  equipmentRole: 'other',
  equipmentTypes: [],
  systemType: null,
  capacityBtu: null,
  includesRemote: false,
  includesThermostat: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
});

const selection = (item: ICatalogueItem, brand: string | null) => ({
  id: randomUUID(),
  title: '',
  systemType: SYSTEM_TYPE.GENERAL,
  brand,
  items: [
    {
      id: randomUUID(),
      catalogueItemId: item.id,
      parentItemId: null,
      description: item.description,
      quotedPrice: '100',
      quantity: '1',
      location: '',
      circuit: null,
      requestedCapacityBtu: null,
    },
  ],
});

describe('quotation selection across brand tabs', () => {
  const alpha = catalogue('אלקטרה');
  const beta = catalogue('תדיראן');
  const general = catalogue('');
  const catalogueService = mock<CatalogueItemService>();
  const usageService = mock<CatalogueItemUsageService>();
  const transaction = mock<Transaction>();
  catalogueService.getByIds.mockResolvedValue([
    mock<CatalogueItem>(alpha),
    mock<CatalogueItem>(beta),
    mock<CatalogueItem>(general),
  ]);
  usageService.record.mockImplementation(() => Promise.resolve());
  const service = new QuotationSelectionService(catalogueService, usageService);
  const run = (sections: ReturnType<typeof selection>[]) =>
    service.snapshots({
      current: quotationDocumentFixture([]),
      userId: randomUUID(),
      transaction,
      input: {
        brand: 'אלקטרה',
        brands: ['אלקטרה', 'תדיראן'],
        sections,
      } as SaveQuotationDto,
    });

  beforeEach(() => {
    catalogueService.getByIds.mockClear();
    usageService.record.mockClear();
  });

  it('accepts each brand and unbranded General item while preserving line snapshots', async () => {
    const snapshots = await run([
      selection(alpha, 'אלקטרה'),
      selection(beta, 'תדיראן'),
      selection(general, null),
    ]);
    expect(snapshots.map((item) => item.catalogueItemId)).toEqual([
      alpha.id,
      beta.id,
      general.id,
    ]);
    expect(snapshots.map((item) => item.quotedPrice)).toEqual([
      '100',
      '100',
      '100',
    ]);
  });

  it('rejects branded catalogue items in General or the wrong brand tab', async () => {
    await expect(run([selection(alpha, null)])).rejects.toThrow('חברת המיזוג');
    await expect(run([selection(alpha, 'תדיראן')])).rejects.toThrow(
      'חברת המיזוג',
    );
    expect(usageService.record.mock.calls).toHaveLength(0);
  });
});
