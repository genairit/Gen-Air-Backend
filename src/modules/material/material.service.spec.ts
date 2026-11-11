import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { MaterialService } from './material.service';
import { UpdateMaterialDto } from './dto/material.dto';
import type { Material } from './entities/material.entity';
import type { MaterialRepository } from './material.repository';
import type { CatalogueMaterialService } from './catalogue-material.service';
import { MATERIAL_STATUS, MATERIAL_UNIT } from './constants/material.constant';
import type { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

describe('MaterialService', () => {
  const id = randomUUID();
  const transaction = mock<Transaction>();
  const repository = mock<MaterialRepository>();
  const catalogueMaterials = mock<CatalogueMaterialService>();
  const transactions = mock<DatabaseTransactionService>();
  const service = new MaterialService(
    repository,
    catalogueMaterials,
    transactions,
  );
  const existing = () =>
    mock<Material>({
      id,
      code: 'COPPER-TEST',
      name: 'Original',
      category: 'Pipe',
      specification: null,
      status: MATERIAL_STATUS.ACTIVE,
      unit: MATERIAL_UNIT.METRE,
      notes: '',
    });

  beforeEach(() => {
    jest.resetAllMocks();
    transactions.run.mockImplementation((work) => work(transaction));
    repository.findById.mockResolvedValue(existing());
  });

  it('creates a new material under its code lock', async () => {
    const created = existing();
    repository.create.mockResolvedValue(created);
    const values = {
      code: 'COPPER-TEST',
      name: 'Copper pipe',
      category: 'Pipe',
      unit: MATERIAL_UNIT.METRE,
      status: MATERIAL_STATUS.NEEDS_SPEC,
    };
    await expect(service.create(values)).resolves.toBe(created);
    expect(transactions.lockKey.mock.calls[0][0]).toBe('material:COPPER-TEST');
    expect(repository.create.mock.calls[0][1]).toBe(transaction);
  });

  it('rejects a duplicate code before inserting', async () => {
    repository.findByCode.mockResolvedValue(existing());
    await expect(
      service.create({
        code: 'COPPER-TEST',
        name: 'Copper pipe',
        category: 'Pipe',
        unit: MATERIAL_UNIT.METRE,
        status: MATERIAL_STATUS.ACTIVE,
      }),
    ).rejects.toThrow('קוד חומר כבר קיים');
    expect(repository.create.mock.calls).toHaveLength(0);
  });

  it('does not refresh a breakdown for notes-only or unchanged updates', async () => {
    await service.update(id, { notes: 'Buyer note' }, randomUUID());
    await service.update(id, { name: 'Original' }, randomUUID());
    expect(catalogueMaterials.refreshForMaterial.mock.calls).toHaveLength(0);
  });

  it('refreshes linked breakdowns when a snapshotted field changes', async () => {
    const actorId = randomUUID();
    await service.update(id, { name: 'Updated' }, actorId);
    expect(catalogueMaterials.refreshForMaterial.mock.calls[0]).toEqual([
      id,
      actorId,
      transaction,
    ]);
  });

  it('rejects blank names and missing identities', async () => {
    await expect(
      service.update(id, { name: '' }, randomUUID()),
    ).rejects.toThrow('שם חומר חובה');
    repository.findById.mockResolvedValue(null);
    await expect(
      service.update(id, { notes: 'x' }, randomUUID()),
    ).rejects.toThrow('חומר לא נמצא');
  });

  it('rejects explicit null status and notes at the HTTP validation boundary', () => {
    for (const changes of [{ status: null }, { notes: null }]) {
      const values = plainToInstance(UpdateMaterialDto, changes);
      expect(validateSync(values)).toHaveLength(1);
    }
  });
});
