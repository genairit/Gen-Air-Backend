import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import type { Supplier } from './entities/supplier.entity';
import { SupplierAgreementService } from './supplier-agreement.service';
import type { ProjectBoqService } from '@Modules/project-boq/project-boq.service';
import type { SupplierAgreementRepository } from './supplier-agreement.repository';
import type { ProjectSupplierAgreement } from './entities/project-supplier-agreement.entity';
import type { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const projectId = randomUUID();
const supplierId = randomUUID();
const agreementId = randomUUID();
const materialId = randomUUID();
const sourceKey = 'source:material';

describe('SupplierAgreementService', () => {
  const repository = mock<SupplierAgreementRepository>();
  const boq = mock<ProjectBoqService>();
  const transactions = mock<DatabaseTransactionService>();
  const service = new SupplierAgreementService(repository, boq, transactions);
  const transaction = mock<Transaction>();
  const supplier = mock<Supplier>({
    id: supplierId,
    name: 'ספק א',
    contactName: 'איש קשר',
    phone: '0501234567',
    email: 'orders@example.test',
    notes: '',
    active: true,
    version: 1,
  });
  const agreement = mock<ProjectSupplierAgreement>({
    id: agreementId,
    projectId,
    boqSourceKey: sourceKey,
    materialId,
    materialUnit: 'unit',
    supplierId,
    unitPrice: '12.5000',
    currencyCode: 'ILS',
    agreedQuantity: '20.00000000',
    effectiveFrom: '2026-11-01',
    effectiveThrough: '2026-12-31',
    active: true,
    version: 2,
    notes: '',
  });
  const selectedLine = {
    agreementId,
    boqSourceKey: sourceKey,
    materialId,
    materialUnit: 'unit',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    repository.supplier.mockResolvedValue(supplier);
    repository.agreementsByIds.mockResolvedValue([agreement]);
    transactions.run.mockImplementation((work) => work(transaction));
  });

  it('resolves a project line to the negotiated price and supplier contact snapshot', async () => {
    const selected = await service.resolveSelection(
      projectId,
      supplierId,
      [selectedLine],
      '2026-11-17',
      transaction,
    );
    expect(selected.selectedSupplier).toMatchObject({
      name: 'ספק א',
      contactName: 'איש קשר',
      email: 'orders@example.test',
    });
    expect(selected.agreements.get(sourceKey)).toEqual({
      id: agreementId,
      version: 2,
      unitPrice: '12.5000',
      currencyCode: 'ILS',
    });
  });

  it('rejects cross-project, expired, wrong-unit and caller-changed prices', async () => {
    await expect(
      service.resolveSelection(
        randomUUID(),
        supplierId,
        [selectedLine],
        '2026-11-17',
        transaction,
      ),
    ).rejects.toThrow('אינו מתאים');
    await expect(
      service.resolveSelection(
        projectId,
        supplierId,
        [selectedLine],
        '2027-01-01',
        transaction,
      ),
    ).rejects.toThrow('אינו מתאים');
    await expect(
      service.resolveSelection(
        projectId,
        supplierId,
        [{ ...selectedLine, materialUnit: 'm' }],
        '2026-11-17',
        transaction,
      ),
    ).rejects.toThrow('אינו מתאים');
    await expect(
      service.resolveSelection(
        projectId,
        supplierId,
        [{ ...selectedLine, unitCost: '13' }],
        '2026-11-17',
        transaction,
      ),
    ).rejects.toThrow('שונה ממחיר ההסכם');
    await expect(
      service.resolveSelection(
        projectId,
        supplierId,
        [{ ...selectedLine, agreementVersion: 1 }],
        '2026-11-17',
        transaction,
      ),
    ).rejects.toThrow('הסכם הספק השתנה');
  });

  it('rejects a stale manager price edit before writing a new revision', async () => {
    repository.agreement.mockResolvedValue(agreement);
    await expect(
      service.updateAgreement(
        projectId,
        agreementId,
        { expectedVersion: 1, unitPrice: '13', currencyCode: 'ILS' },
        randomUUID(),
      ),
    ).rejects.toThrow('ההסכם השתנה');
    expect(repository.updateAgreement.mock.calls).toHaveLength(0);
    expect(repository.createRevision.mock.calls).toHaveLength(0);
  });
});
