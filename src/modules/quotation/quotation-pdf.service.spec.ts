import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QuotationService } from './quotation.service';
import { UserService } from '@Modules/user/user.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { ProjectService } from '@Modules/project/project.service';
import { QUOTATION_STATUS } from './constants/quotation.constant';
import { CustomerService } from '@Modules/customer/customer.service';
import { quotationDocumentFixture } from '../../testing/quotation.fixture';
import { QuotationPdfSnapshotService } from './quotation-pdf-snapshot.service';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import type { IPublicationSnapshot } from '@Modules/quotation-publication/interfaces/publication.interface';

const pdf = Buffer.from('%PDF-1.7\nquotation');
const document = quotationDocumentFixture([]);
const customer = {
  name: 'לקוח',
  taxId: '123456789',
  customerType: 'company',
  address: 'רחוב 1',
  email: null,
  phone: null,
  priorityId: null,
};
const customers = { getById: jest.fn().mockResolvedValue(customer) };
const user = { firstName: 'דנה', lastName: 'כהן' };
const project = {
  id: 'project-1',
  code: 'P-204',
  name: 'פרויקט',
  parentProjectId: null,
  customerApartment: '12',
  address: 'רחוב 2',
  addressCity: 'תל אביב',
  customerName: null,
  customerAddress: null,
  customerEmail: null,
  customerPhone: null,
};
const projects = { quotationSnapshot: jest.fn().mockResolvedValue(project) };
const drive = {
  uploadQuotationPdf: jest.fn().mockResolvedValue({ id: 'file-1' }),
};
const render = jest.spyOn(global, 'fetch');
const quotation = { document: jest.fn().mockResolvedValue(document) };
const workerConfiguration: Record<string, string> = {
  WORKER_URL: 'http://worker:3001',
  WORKER_API_TOKEN: 'a-long-worker-api-token-of-at-least-32-characters',
};
const config = { get: (key: string): string => workerConfiguration[key] };
const state: {
  service: QuotationPdfService | null;
  snapshots: QuotationPdfSnapshotService | null;
} = { service: null, snapshots: null };

beforeAll(async (): Promise<void> => {
  const module = await Test.createTestingModule({
    providers: [
      QuotationPdfService,
      QuotationPdfSnapshotService,
      { provide: ConfigService, useValue: config },
      { provide: QuotationService, useValue: quotation },
      { provide: CustomerService, useValue: customers },
      { provide: ProjectService, useValue: projects },
      {
        provide: UserService,
        useValue: {
          findByIdIncludingDeleted: jest.fn().mockResolvedValue(user),
        },
      },
      { provide: ProjectDriveService, useValue: drive },
    ],
  }).compile();
  state.service = module.get(QuotationPdfService);
  state.snapshots = module.get(QuotationPdfSnapshotService);
});

beforeEach((): void => {
  document.projectId = null;
  document.status = QUOTATION_STATUS.DRAFT;
  customers.getById.mockReset().mockResolvedValue(customer);
  projects.quotationSnapshot.mockReset().mockResolvedValue(project);
  drive.uploadQuotationPdf.mockReset().mockResolvedValue({ id: 'file-1' });
  render
    .mockReset()
    .mockImplementation((): Promise<Response> =>
      Promise.resolve(
        new Response(pdf, { headers: { 'content-type': 'application/pdf' } }),
      ),
    );
});

afterAll((): void => {
  render.mockRestore();
});

const exportPdf = async (): Promise<{ filename: string; pdf: Buffer }> => {
  if (!state.service) {
    throw new Error('Test service unavailable');
  }

  return state.service.export(document.id);
};

const capture = (): Promise<IPublicationSnapshot> => {
  if (!state.snapshots) {
    throw new Error('Test snapshot service unavailable');
  }

  return state.snapshots.capture(document);
};

const workerPayload = (): unknown => {
  const body = render.mock.calls.at(-1)?.[1]?.body ?? null;
  if (typeof body !== 'string') {
    throw new Error('Expected a JSON worker request');
  }

  return JSON.parse(body);
};

it('returns a named downloadable PDF without loading a project or uploading when none is linked', async (): Promise<void> => {
  const result = await exportPdf();
  expect(result.filename).toBe('הצעת מחיר - 2610-000001 - לקוח - אלקטרה.pdf');
  expect(result.pdf).toEqual(pdf);
  expect(projects.quotationSnapshot).not.toHaveBeenCalled();
  expect(drive.uploadQuotationPdf).not.toHaveBeenCalled();
  expect(render).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({ method: 'POST' }),
  );
});

it('uses the canonical primary project name rather than its code without Drive publication', async (): Promise<void> => {
  document.projectId = project.id;
  const result = await exportPdf();
  expect(result.filename).toBe(
    'הצעת מחיר - 2610-000001 - לקוח - פרויקט - דירה 12 - אלקטרה.pdf',
  );
  expect(projects.quotationSnapshot).toHaveBeenCalledTimes(1);
  expect(result.filename).not.toContain(project.code);
  expect(drive.uploadQuotationPdf).not.toHaveBeenCalled();
  expect(result.pdf).toEqual(pdf);
});

it('uses the already-loaded parent name and keeps the primary apartment name', async (): Promise<void> => {
  document.projectId = project.id;
  projects.quotationSnapshot.mockResolvedValueOnce({
    ...project,
    name: 'דירה 4',
    customerApartment: '4',
    parentProjectId: 'parent-building',
    parentProject: {
      id: 'parent-building',
      name: 'מגדל הים',
      code: 'BUILDING-999',
    },
  });
  const result = await exportPdf();
  expect(result.filename).toBe(
    'הצעת מחיר - 2610-000001 - לקוח - דירה 4 - בנין מגדל הים דירה 4 - אלקטרה.pdf',
  );
  expect(projects.quotationSnapshot).toHaveBeenCalledTimes(1);
  expect(workerPayload()).toHaveProperty('project.name', 'דירה 4');
});

it('does not infer a building name from unrelated context when no parent is linked', async (): Promise<void> => {
  document.projectId = project.id;
  projects.quotationSnapshot.mockResolvedValueOnce({
    ...project,
    parentProject: { name: 'UNRELATED BUILDING' },
  });
  const result = await exportPdf();
  expect(result.filename).toBe(
    'הצעת מחיר - 2610-000001 - לקוח - פרויקט - דירה 12 - אלקטרה.pdf',
  );
});

it('omits a missing parent without fabricating a building from the code or address', async (): Promise<void> => {
  document.projectId = project.id;
  projects.quotationSnapshot.mockResolvedValueOnce({
    ...project,
    parentProjectId: 'deleted-parent',
    parentProject: null,
  });
  expect((await exportPdf()).filename).toBe(
    'הצעת מחיר - 2610-000001 - לקוח - פרויקט - דירה 12 - אלקטרה.pdf',
  );
});

it('falls back from a whitespace project customer override in both filename and rendered recipient', async (): Promise<void> => {
  document.projectId = project.id;
  projects.quotationSnapshot.mockResolvedValueOnce({
    ...project,
    customerName: ' \t\n ',
  });
  expect((await exportPdf()).filename).toBe(
    'הצעת מחיר - 2610-000001 - לקוח - פרויקט - דירה 12 - אלקטרה.pdf',
  );
  expect(workerPayload()).toHaveProperty('recipient.name', customer.name);
});

it('uses an explicit project recipient in both the document and canonical filename', async (): Promise<void> => {
  document.projectId = project.id;
  projects.quotationSnapshot.mockResolvedValueOnce({
    ...project,
    customerName: 'דייר אחר',
  });
  expect((await exportPdf()).filename).toBe(
    'הצעת מחיר - 2610-000001 - דייר אחר - פרויקט - דירה 12 - אלקטרה.pdf',
  );
  expect(workerPayload()).toHaveProperty('recipient.name', 'דייר אחר');
});

it('uses the same order title and stored number in rendered content and filename', async (): Promise<void> => {
  document.status = QUOTATION_STATUS.APPROVED;
  const result = await exportPdf();
  expect(result.filename).toBe('הזמנה - 2610-000001 - לקוח - אלקטרה.pdf');
  expect(workerPayload()).toHaveProperty('title', 'הזמנה');
  expect(workerPayload()).toHaveProperty('number', '2610-000001');
});

it('captures v2 naming inputs once alongside the final publication filename', async (): Promise<void> => {
  document.projectId = project.id;
  const snapshot = await capture();
  expect(snapshot.filenamePolicy).toBe('quotation-filename.v2');
  expect(snapshot.filename).toBe(
    'הצעת מחיר - 2610-000001 - לקוח - פרויקט - דירה 12 - אלקטרה.pdf',
  );
  expect(snapshot.namingInputs).toMatchObject({
    quotationId: document.id,
    title: 'הצעת מחיר',
    number: '2610-000001',
    customerName: 'לקוח',
    projectName: 'פרויקט',
    buildingName: null,
    apartmentNumber: '12',
    brands: ['אלקטרה'],
  });
  expect(snapshot.namingInputs).not.toHaveProperty('projectCode');
  projects.quotationSnapshot.mockResolvedValueOnce({
    ...project,
    name: 'שם חדש',
  });
  const later = await capture();
  expect(later.filename).toContain('שם חדש');
  expect(snapshot.filename).not.toContain('שם חדש');
  expect(snapshot.namingInputs).toHaveProperty('projectName', 'פרויקט');
});

it('reports a worker transport failure and never uploads', async (): Promise<void> => {
  document.projectId = project.id;
  render.mockRejectedValue(new Error('connection refused'));
  await expect(exportPdf()).rejects.toThrow(
    'Quotation PDF worker is unavailable',
  );
  expect(drive.uploadQuotationPdf).not.toHaveBeenCalled();
});

it('rejects invalid worker output and never uploads', async (): Promise<void> => {
  document.projectId = project.id;
  render.mockResolvedValue(
    new Response('not a PDF', {
      headers: { 'content-type': 'application/pdf' },
    }),
  );
  await expect(exportPdf()).rejects.toThrow(
    'Quotation PDF worker returned an invalid file',
  );
  expect(drive.uploadQuotationPdf).not.toHaveBeenCalled();
});

it('preserves manual download while Drive is unavailable', async (): Promise<void> => {
  document.projectId = project.id;
  drive.uploadQuotationPdf.mockRejectedValue(new Error('Drive unavailable'));
  expect((await exportPdf()).pdf).toEqual(pdf);
  expect(drive.uploadQuotationPdf).not.toHaveBeenCalled();
});

it('renders the explicit customer primary contact rather than unrelated or legacy details', async (): Promise<void> => {
  customers.getById.mockResolvedValueOnce({
    ...customer,
    email: 'legacy@example.com',
    phone: '0500000000',
    primaryContact: {
      id: 'own-contact',
      email: 'own@example.com',
      phone: '+442071838750',
    },
    contacts: [
      {
        id: 'unrelated-first',
        email: 'unrelated@example.com',
        phone: '0511111111',
      },
    ],
  });
  await exportPdf();
  expect(workerPayload()).toHaveProperty('recipient.email', 'own@example.com');
  expect(workerPayload()).toHaveProperty('recipient.phone', '+442071838750');
});
