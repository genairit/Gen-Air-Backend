import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QuotationService } from './quotation.service';
import { UserService } from '@Modules/user/user.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { ProjectService } from '@Modules/project/project.service';
import { CustomerService } from '@Modules/customer/customer.service';
import { quotationDocumentFixture } from '../../testing/quotation.fixture';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';

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
const user = { firstName: 'דנה', lastName: 'כהן' };
const project = {
  id: 'project-1',
  name: 'פרויקט',
  address: 'רחוב 2',
  addressCity: 'תל אביב',
  customerName: null,
  customerAddress: null,
  customerEmail: null,
  customerPhone: null,
};
const drive = {
  uploadQuotationPdf: jest.fn().mockResolvedValue({ id: 'file-1' }),
};
const render = jest.spyOn(global, 'fetch');
const quotation = { document: jest.fn().mockResolvedValue(document) };
const config = {
  get: (key: string) =>
    key === 'WORKER_URL'
      ? 'http://worker:3001'
      : 'a-long-worker-api-token-of-at-least-32-characters',
};
const state: { service: QuotationPdfService | null } = { service: null };

beforeAll(async () => {
  const module = await Test.createTestingModule({
    providers: [
      QuotationPdfService,
      { provide: ConfigService, useValue: config },
      { provide: QuotationService, useValue: quotation },
      {
        provide: CustomerService,
        useValue: { getById: jest.fn().mockResolvedValue(customer) },
      },
      {
        provide: ProjectService,
        useValue: { getById: jest.fn().mockResolvedValue(project) },
      },
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
});
beforeEach(() => {
  document.projectId = null;
  drive.uploadQuotationPdf.mockReset().mockResolvedValue({ id: 'file-1' });
  render
    .mockReset()
    .mockImplementation(
      async () =>
        new Response(pdf, { headers: { 'content-type': 'application/pdf' } }),
    );
});
afterAll(() => render.mockRestore());

const exportPdf = async () => {
  if (!state.service) {
    throw new Error('Test service unavailable');
  }
  return state.service.export(document.id);
};

it('returns a downloadable PDF without a Drive upload when no project is linked', async () => {
  const result = await exportPdf();
  expect(result.pdf).toEqual(pdf);
  expect(drive.uploadQuotationPdf).not.toHaveBeenCalled();
  expect(render).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({ method: 'POST' }),
  );
});

it('uploads a linked quotation before returning the same PDF bytes', async () => {
  document.projectId = project.id;
  const result = await exportPdf();
  expect(drive.uploadQuotationPdf).toHaveBeenCalledWith(
    project.id,
    result.filename,
    pdf,
  );
  expect(result.pdf).toEqual(pdf);
});

it('reports a worker transport failure and never uploads', async () => {
  document.projectId = project.id;
  render.mockRejectedValue(new Error('connection refused'));
  await expect(exportPdf()).rejects.toThrow(
    'Quotation PDF worker is unavailable',
  );
  expect(drive.uploadQuotationPdf).not.toHaveBeenCalled();
});

it('rejects invalid worker output and never uploads', async () => {
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

it('does not return a linked quotation when its Drive upload fails', async () => {
  document.projectId = project.id;
  drive.uploadQuotationPdf.mockRejectedValue(new Error('Drive unavailable'));
  await expect(exportPdf()).rejects.toThrow('Drive unavailable');
});
