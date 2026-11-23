import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QuotationService } from './quotation.service';
import { UserService } from '@Modules/user/user.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { ProjectService } from '@Modules/project/project.service';
import { CustomerService } from '@Modules/customer/customer.service';
import { quotationDocumentFixture } from '../../testing/quotation.fixture';
import { QuotationPdfSnapshotService } from './quotation-pdf-snapshot.service';
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
const customers = { getById: jest.fn().mockResolvedValue(customer) };
const user = { firstName: 'דנה', lastName: 'כהן' };
const project = {
  id: 'project-1',
  code: 'P-204',
  name: 'פרויקט',
  customerApartment: '12',
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
      QuotationPdfSnapshotService,
      { provide: ConfigService, useValue: config },
      { provide: QuotationService, useValue: quotation },
      {
        provide: CustomerService,
        useValue: customers,
      },
      {
        provide: ProjectService,
        useValue: { quotationSnapshot: jest.fn().mockResolvedValue(project) },
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
  customers.getById.mockReset().mockResolvedValue(customer);
  drive.uploadQuotationPdf.mockReset().mockResolvedValue({ id: 'file-1' });
  render
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve(
        new Response(pdf, { headers: { 'content-type': 'application/pdf' } }),
      ),
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

it('downloads a linked quotation without Drive publication', async (): Promise<void> => {
  document.projectId = project.id;
  const result = await exportPdf();
  expect(result.filename).toBe(
    'הצעת מחיר 2610-000001_לקוח_P-204_12_אלקטרה.pdf',
  );
  expect(drive.uploadQuotationPdf).not.toHaveBeenCalled();
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

it('preserves manual download while Drive is unavailable', async (): Promise<void> => {
  document.projectId = project.id;
  drive.uploadQuotationPdf.mockRejectedValue(new Error('Drive unavailable'));
  expect((await exportPdf()).pdf).toEqual(pdf);
  expect(drive.uploadQuotationPdf).not.toHaveBeenCalled();
});

it('renders the explicit customer primary contact rather than unrelated or legacy customer details', async () => {
  customers.getById.mockResolvedValueOnce({
    ...customer,
    email: 'legacy@example.com',
    phone: '0500000000',
    primaryContact: {
      id: 'explicit-own-contact',
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
  const body = render.mock.calls.at(-1)?.[1]?.body ?? null;
  if (typeof body !== 'string') {
    throw new Error('Expected a JSON worker request');
  }

  const payload: unknown = JSON.parse(body);
  expect(payload).toHaveProperty('recipient.email', 'own@example.com');
  expect(payload).toHaveProperty('recipient.phone', '+442071838750');
});
