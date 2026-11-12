import {
  MATERIAL_BASIS,
  MATERIAL_STATUS,
} from '@Modules/material/constants/material.constant';

import type {
  IQuotationDocument,
  IQuotationSectionDocument,
} from '@Modules/quotation/interfaces/quotation-document.interface';

import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import type { Transaction } from 'sequelize';
import { PROJECT_BOQ_REVIEW } from './constants';
import { ProjectBoqService } from './project-boq.service';
import type { ProjectBoq } from './entities/project-boq.entity';
import type { ProjectBoqRepository } from './project-boq.repository';
import type { ProjectService } from '@Modules/project/project.service';
import type { ProjectBoqLine } from './entities/project-boq-line.entity';
import type { MaterialService } from '@Modules/material/material.service';
import type { QuotationService } from '@Modules/quotation/quotation.service';
import { QUOTATION_STATUS } from '@Modules/quotation/constants/quotation.constant';
import type { CatalogueMaterialService } from '@Modules/material/catalogue-material.service';
import type { IQuotationItem } from '@Modules/quotation-item/interfaces/quotation-item.interface';
import type { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const projectId = randomUUID();
const quoteId = randomUUID();
const itemId = randomUUID();
const materialId = randomUUID();
const sectionId = randomUUID();
const itemLineId = randomUUID();
const actorId = randomUUID();

const item = mock<IQuotationItem>({
  id: itemLineId,
  catalogueItemId: itemId,
  sku: 'UNIT-1',
  quantity: '2',
  description: 'Unit',
});
const section = mock<IQuotationSectionDocument>({
  id: sectionId,
  title: 'Cooling',
  items: [item],
});
const quotation = mock<IQuotationDocument>({
  id: quoteId,
  projectId,
  status: QUOTATION_STATUS.APPROVED,
  version: 1,
  number: 'Q-1',
  sections: [section],
});
const material = (
  basis: (typeof MATERIAL_BASIS)[keyof typeof MATERIAL_BASIS],
  quantityPerItem: string | null,
) => ({
  materialId,
  code: 'MAT-1',
  name: 'Bracket',
  category: 'Mounting',
  specification: null,
  unit: 'unit',
  status: MATERIAL_STATUS.ACTIVE,
  basis,
  quantityPerItem,
  notes: '',
  displayOrder: 0,
});

describe('ProjectBoqService', () => {
  const repository = mock<ProjectBoqRepository>();
  const projects = mock<ProjectService>();
  const quotations = mock<QuotationService>();
  const materials = mock<MaterialService>();
  const breakdowns = mock<CatalogueMaterialService>();
  const transactions = mock<DatabaseTransactionService>();
  const service = new ProjectBoqService(
    repository,
    projects,
    quotations,
    materials,
    breakdowns,
    transactions,
  );
  const transaction = mock<Transaction>();

  beforeEach(() => {
    jest.resetAllMocks();
    repository.find.mockResolvedValue(null);
    quotations.document.mockResolvedValue(quotation);
    breakdowns.getCurrent.mockResolvedValue({
      catalogueItemId: itemId,
      revision: 1,
      lines: [material(MATERIAL_BASIS.FIXED, '3')],
    });
    transactions.run.mockImplementation((work) => work(transaction));
  });

  it('multiplies fixed quantities by quotation quantity and leaves measured quantities unresolved', async () => {
    const fixed = await service.preview(projectId, quoteId);
    expect(fixed.lines).toHaveLength(1);
    expect(fixed.lines[0]).toMatchObject({
      proposedQuantity: '6.00000000',
      requiredQuantity: '6.00000000',
      reviewState: PROJECT_BOQ_REVIEW.CONFIRMED,
    });
    breakdowns.getCurrent.mockResolvedValue({
      catalogueItemId: itemId,
      revision: 2,
      lines: [material(MATERIAL_BASIS.PROJECT_MEASUREMENT, null)],
    });
    const measured = await service.preview(projectId, quoteId);
    expect(measured.lines[0]).toMatchObject({
      proposedQuantity: null,
      requiredQuantity: null,
      reviewState: PROJECT_BOQ_REVIEW.PENDING,
    });
  });

  it('rejects a quotation belonging to another project', async () => {
    quotations.document.mockResolvedValue(
      mock<IQuotationDocument>({ ...quotation, projectId: randomUUID() }),
    );
    await expect(service.preview(projectId, quoteId)).rejects.toThrow(
      'יש לבחור הצעה מאושרת המקושרת ישירות לפרויקט',
    );
  });

  it('rejects a stale generation revision before writing', async () => {
    repository.find.mockResolvedValue(mock<ProjectBoq>({ revision: 2 }));
    await expect(
      service.generate(
        projectId,
        {
          quotationId: quoteId,
          quotationVersion: 1,
          expectedRevision: 1,
          previewFingerprint: '0'.repeat(64),
        },
        actorId,
      ),
    ).rejects.toThrow('כתב הרכש השתנה');
    expect(repository.replaceLines.mock.calls).toHaveLength(0);
  });

  it('keeps fixed quantities automatic when only estimated cost changes', async () => {
    const boq = mock<ProjectBoq>({
      id: randomUUID(),
      projectId,
      revision: 1,
      sourceQuotationId: quoteId,
      sourceQuotationVersion: 1,
      updatedAt: new Date(),
    });
    const line = mock<ProjectBoqLine>({
      id: randomUUID(),
      boqId: boq.id,
      materialId,
      sourceKey: 'key',
      systemTitle: 'Cooling',
      componentTitle: 'Unit',
      materialCode: 'MAT-1',
      materialName: 'Bracket',
      materialCategory: 'Mounting',
      materialSpecification: null,
      materialUnit: 'unit',
      sourceBasis: MATERIAL_BASIS.FIXED,
      proposedQuantity: '6.00000000',
      requiredQuantity: '6.00000000',
      quantityOverridden: false,
      estimatedUnitCost: null,
      reviewState: PROJECT_BOQ_REVIEW.CONFIRMED,
      notes: '',
      sourceSnapshot: {},
      displayOrder: 0,
    });
    repository.find.mockResolvedValue(boq);
    repository.lines.mockResolvedValue([line]);
    await service.updateLine(
      projectId,
      line.id,
      {
        expectedRevision: 1,
        requiredQuantity: '6.00000000',
        estimatedUnitCost: '100',
        reviewState: PROJECT_BOQ_REVIEW.CONFIRMED,
        notes: '',
      },
      actorId,
    );
    expect(repository.updateLine.mock.calls[0]).toEqual([
      line,
      expect.objectContaining({
        quantityOverridden: false,
        estimatedUnitCost: '100',
      }),
      transaction,
    ]);
  });
});
