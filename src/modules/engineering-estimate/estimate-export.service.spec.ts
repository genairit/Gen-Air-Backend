import {
  ESTIMATE_SCOPE,
  ESTIMATE_SETUP_STEP,
  ESTIMATE_LINE_SOURCE,
  ESTIMATE_DOCUMENT_KIND,
} from './constants/engineering-estimate.constant';

import type {
  IEstimateLine,
  IEstimateRecord,
} from './interfaces/engineering-estimate.interface';

import 'reflect-metadata';
import { Transaction } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import { ProjectService } from '@Modules/project/project.service';
import { EstimateExportService } from './estimate-export.service';
import { EstimatePricingService } from './estimate-pricing.service';
import { CustomerService } from '@Modules/customer/customer.service';
import { EstimateDocumentService } from './estimate-document.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { EngineeringEstimateService } from './engineering-estimate.service';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

/* eslint-disable @typescript-eslint/unbound-method */

const line = (overrides: Partial<IEstimateLine> = {}): IEstimateLine => ({
  sku: 'INV 140 A',
  unit: "יח'",
  areaId: 'area-1',
  areaName: 'חדר סטנדרטס',
  quantity: '50',
  description: 'מזגן עילי',
  total: '125250.00',
  unitPrice: '2505.00',
  provenance: null,
  catalogueItemId: randomUUID(),
  source: ESTIMATE_LINE_SOURCE.MANUAL,
  ...overrides,
});

const setup = (projectId: string | null, lines: IEstimateLine[]) => {
  const transaction = mock<Transaction>();
  const estimates = mock<EngineeringEstimateService>();
  const pricing = mock<EstimatePricingService>();
  const projects = mock<ProjectService>();
  const customers = mock<CustomerService>();
  const documents = mock<EstimateDocumentService>();
  const projectDrive = mock<ProjectDriveService>();
  const transactions = mock<DatabaseTransactionService>();
  const actor = mock<IAuthorizedUser>({ id: randomUUID() });
  const record: IEstimateRecord = {
    id: randomUUID(),
    name: 'נסיון ראשון: כתב/כמויות',
    version: 3,
    projectId,
    createdById: actor.id,
    updatedAt: new Date(),
    scope: ESTIMATE_SCOPE.HVAC,
    setupStep: ESTIMATE_SETUP_STEP.PROJECT,
    areas: [],
    questions: [],
  };
  transactions.run.mockImplementation((work) => work(transaction));
  estimates.lockVersion.mockResolvedValue(record);
  pricing.calculate.mockResolvedValue(lines);
  projects.quotationSnapshot.mockResolvedValue({
    name: 'פרויקט',
    customerId: null,
  } as never);
  documents.render.mockResolvedValue(Buffer.from('%PDF-1.7'));
  projectDrive.uploadBoqPdf.mockResolvedValue({
    id: 'drive-file',
    webViewLink: 'https://drive.google.com/file/d/drive-file/view',
  } as never);
  const service = new EstimateExportService(
    estimates,
    pricing,
    projects,
    customers,
    documents,
    projectDrive,
    transactions,
  );
  return { service, record, actor, documents, projectDrive };
};

describe('EstimateExportService', () => {
  it('renders the boq document and saves it to the project boq Drive folder', async () => {
    const projectId = randomUUID();
    const { service, record, actor, documents, projectDrive } = setup(
      projectId,
      [line()],
    );

    const result = await service.exportToDrive(
      { id: record.id, actor },
      record.version,
    );

    expect(documents.render).toHaveBeenCalledWith(
      expect.objectContaining({ kind: ESTIMATE_DOCUMENT_KIND.BOQ, version: 3 }),
    );
    expect(projectDrive.uploadBoqPdf).toHaveBeenCalledWith(
      projectId,
      'נסיון ראשון כתב כמויות - כתב כמויות - גרסה 3.pdf',
      expect.any(Buffer),
    );
    expect(result).toEqual({
      fileName: 'נסיון ראשון כתב כמויות - כתב כמויות - גרסה 3.pdf',
      fileUrl: 'https://drive.google.com/file/d/drive-file/view',
    });
  });

  it('requires a linked project', async () => {
    const { service, record, actor, projectDrive } = setup(null, [line()]);

    await expect(
      service.exportToDrive({ id: record.id, actor }, record.version),
    ).rejects.toThrow(ConflictException);
    expect(projectDrive.uploadBoqPdf).not.toHaveBeenCalled();
  });

  it.each([
    ['no lines', []],
    ['a missing price', [line({ unitPrice: null, total: null })]],
  ])('rejects an estimate with %s', async (_name, lines) => {
    const { service, record, actor, documents } = setup(randomUUID(), lines);

    await expect(
      service.exportToDrive({ id: record.id, actor }, record.version),
    ).rejects.toThrow(BadRequestException);
    expect(documents.render).not.toHaveBeenCalled();
  });
});
