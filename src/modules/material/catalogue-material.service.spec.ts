import type {
  MaterialBasisType,
  MaterialStatusType,
} from './constants/material.constant';

import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import type { Material } from './entities/material.entity';
import type { MaterialRepository } from './material.repository';
import { CatalogueMaterialService } from './catalogue-material.service';
import { MATERIAL_BASIS, MATERIAL_STATUS } from './constants/material.constant';
import type { CatalogueMaterialRepository } from './catalogue-material.repository';
import type { CatalogueItemMaterial } from './entities/catalogue-item-material.entity';
import type { CatalogueItemService } from '@Modules/catalogue-item/catalogue-item.service';
import type { CatalogueItem } from '@Modules/catalogue-item/entities/catalogue-item.entity';
import type { DatabaseTransactionService } from '@Providers/database/database-transaction.service';
import type { CatalogueItemMaterialRevision } from './entities/catalogue-item-material-revision.entity';

describe('CatalogueMaterialService', () => {
  const itemId = randomUUID();
  const copperId = randomUUID();
  const controllerId = randomUUID();
  const panelId = randomUUID();
  const transaction = mock<Transaction>();
  const materials = mock<MaterialRepository>();
  const catalogue = mock<CatalogueItemService>();
  const repository = mock<CatalogueMaterialRepository>();
  const transactions = mock<DatabaseTransactionService>();
  const material = (id: string, status: MaterialStatusType) =>
    mock<Material>({
      id,
      status,
      code: id,
      name: id,
      category: 'test',
      specification: null,
      unit: 'unit',
    });
  const link = (
    materialId: string,
    basis: MaterialBasisType,
    quantityPerItem: string,
  ) =>
    mock<CatalogueItemMaterial>({
      materialId,
      catalogueItemId: itemId,
      basis,
      quantityPerItem,
      notes: '',
      displayOrder: 0,
    });
  const service = new CatalogueMaterialService(
    materials,
    catalogue,
    repository,
    transactions,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    transactions.readSnapshot.mockImplementation((work) => work(transaction));
    transactions.run.mockImplementation((work) => work(transaction));
    catalogue.getByIds.mockResolvedValue([mock<CatalogueItem>({ id: itemId })]);
    catalogue.getById.mockResolvedValue(mock<CatalogueItem>({ id: itemId }));
    materials.findByIds.mockImplementation((ids) =>
      [
        material(copperId, MATERIAL_STATUS.ACTIVE),
        material(controllerId, MATERIAL_STATUS.NEEDS_SPEC),
        material(panelId, MATERIAL_STATUS.NEEDS_SPEC),
      ].filter((row) => ids.includes(row.id)),
    );
  });

  it('calculates exact decimal totals and keeps conditional and included parts separate', async () => {
    repository.listForItems.mockResolvedValue([
      link(copperId, MATERIAL_BASIS.FIXED, '1.2500'),
      link(controllerId, MATERIAL_BASIS.CONDITIONAL, '1.0000'),
      link(panelId, MATERIAL_BASIS.INCLUDED, '1.0000'),
    ]);
    await expect(
      service.preview({
        items: [{ catalogueItemId: itemId, quantity: '2.5' }],
      }),
    ).resolves.toMatchObject({
      required: [{ quantity: '3.12500000' }],
      unresolved: [
        { quantity: '2.50000000', basis: MATERIAL_BASIS.CONDITIONAL },
      ],
      included: [{ quantity: '2.50000000', basis: MATERIAL_BASIS.INCLUDED }],
    });
  });

  it('rejects a stale revision without changing the breakdown', async () => {
    repository.latestRevision.mockResolvedValue(
      mock<CatalogueItemMaterialRevision>({ revision: 3 }),
    );
    await expect(
      service.replace(itemId, { expectedRevision: 2, lines: [] }, randomUUID()),
    ).rejects.toThrow('פירוט החומרים השתנה');
    expect(repository.replace.mock.calls).toHaveLength(0);
  });

  it('rejects duplicate material lines before opening a transaction', async () => {
    const line = {
      materialId: copperId,
      basis: MATERIAL_BASIS.FIXED,
      quantityPerItem: '1',
      displayOrder: 0,
    };
    await expect(
      service.replace(
        itemId,
        { expectedRevision: 0, lines: [line, line] },
        randomUUID(),
      ),
    ).rejects.toThrow('חומר או סדר תצוגה כפול');
    expect(transactions.run.mock.calls).toHaveLength(0);
  });

  it('replaces lines and records an immutable revision in the same transaction', async () => {
    const line = {
      materialId: copperId,
      basis: MATERIAL_BASIS.FIXED,
      quantityPerItem: '1.2500',
      displayOrder: 0,
    };
    repository.latestRevision
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        mock<CatalogueItemMaterialRevision>({ revision: 1 }),
      );
    repository.list.mockResolvedValue([
      link(copperId, MATERIAL_BASIS.FIXED, '1.2500'),
    ]);
    await expect(
      service.replace(
        itemId,
        { expectedRevision: 0, lines: [line] },
        randomUUID(),
      ),
    ).resolves.toMatchObject({ revision: 1, lines: [{ code: copperId }] });
    expect(repository.replace.mock.calls[0][2]).toBe(transaction);
    expect(repository.recordRevision.mock.calls[0][2]).toMatchObject([
      { materialId: copperId, quantityPerItem: '1.2500' },
    ]);
    expect(repository.recordRevision.mock.calls[0][4]).toBe(transaction);
  });

  it('refreshes historical snapshots when a linked material identity changes', async () => {
    repository.linkedCatalogueItemIds.mockResolvedValue([itemId]);
    repository.latestRevision.mockResolvedValue(
      mock<CatalogueItemMaterialRevision>({ revision: 2 }),
    );
    repository.list.mockResolvedValue([
      link(copperId, MATERIAL_BASIS.FIXED, '1.0000'),
    ]);
    await service.refreshForMaterial(copperId, randomUUID(), transaction);
    expect(repository.recordRevision.mock.calls[0][1]).toBe(3);
    expect(repository.recordRevision.mock.calls[0][2]).toMatchObject([
      { materialId: copperId },
    ]);
  });

  it('rejects a missing or inactive material without replacing links', async () => {
    const line = {
      materialId: copperId,
      basis: MATERIAL_BASIS.FIXED,
      quantityPerItem: '1',
      displayOrder: 0,
    };
    materials.findByIds.mockResolvedValueOnce([]);
    await expect(
      service.replace(
        itemId,
        { expectedRevision: 0, lines: [line] },
        randomUUID(),
      ),
    ).rejects.toThrow('חומר לא נמצא');
    materials.findByIds.mockResolvedValueOnce([
      material(copperId, MATERIAL_STATUS.INACTIVE),
    ]);
    await expect(
      service.replace(
        itemId,
        { expectedRevision: 0, lines: [line] },
        randomUUID(),
      ),
    ).rejects.toThrow('אי אפשר לשייך חומר לא פעיל');
    expect(repository.replace.mock.calls).toHaveLength(0);
  });

  it('requires project measurements to have no per-item quantity', async () => {
    await expect(
      service.replace(
        itemId,
        {
          expectedRevision: 0,
          lines: [
            {
              materialId: copperId,
              basis: MATERIAL_BASIS.PROJECT_MEASUREMENT,
              quantityPerItem: '3',
              displayOrder: 0,
            },
          ],
        },
        randomUUID(),
      ),
    ).rejects.toThrow('כמות מדידה נקבעת בפרויקט');
    expect(transactions.run.mock.calls).toHaveLength(0);
  });

  it('rejects zero quantities before writing links or previewing', async () => {
    await expect(
      service.replace(
        itemId,
        {
          expectedRevision: 0,
          lines: [
            {
              materialId: copperId,
              basis: MATERIAL_BASIS.FIXED,
              quantityPerItem: '0',
              displayOrder: 0,
            },
          ],
        },
        randomUUID(),
      ),
    ).rejects.toThrow('כמות חומר ליחידת קטלוג חייבת להיות חיובית');
    expect(() =>
      service.preview({ items: [{ catalogueItemId: itemId, quantity: '0' }] }),
    ).toThrow('כמות פריט קטלוג חייבת להיות חיובית');
    expect(transactions.run.mock.calls).toHaveLength(0);
  });
});
