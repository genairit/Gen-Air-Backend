import {
  APARTMENT_IMPORT,
  APARTMENT_IMPORT_COLUMNS,
} from '../constants/apartment-import.constant';

import { Workbook } from 'exceljs';
import { Readable } from 'node:stream';
import { USER_ROLES } from '@Constants/user-role.constant';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';
import { PRIORITY_SYNC_STATUSES } from '@Modules/customer/constants/priority-sync-status.constant';

export const IMPORT_CREATOR: IUser = {
  id: '11111111-1111-4111-8111-111111111111',
  role: USER_ROLES.SYSTEM_ADMIN,
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  phone: '0501234567',
  employeeNumber: '1',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
};
export const IMPORT_CUSTOMER = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'לקוח לדוגמה',
  taxId: '000000018',
  customerType: PROJECT_DETAIL_FIELD_SETS.PRIVATE_CLIENT,
  phone: '0501234567',
  email: 'customer@example.com',
  address: 'רחוב לדוגמה 1',
  contactName: 'איש קשר',
  prioritySyncStatus: PRIORITY_SYNC_STATUSES.PENDING,
};
export const IMPORT_ROW = {
  floor: '1',
  apartment: '1',
  ownership: 'רוכש',
  customerName: IMPORT_CUSTOMER.name,
  customerPhone: IMPORT_CUSTOMER.phone,
  customerEmail: IMPORT_CUSTOMER.email,
  customerType: 'לקוח פרטי',
  customerTaxId: IMPORT_CUSTOMER.taxId,
  customerAddress: IMPORT_CUSTOMER.address,
  contactName: 'איש קשר',
  contactPhone: '0521234567',
  contactEmail: 'contact@example.com',
  credit: '120.50',
};
export const makeImportFile = async (
  rows: Record<string, string>[],
): Promise<Express.Multer.File> => {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(APARTMENT_IMPORT.SHEET);
  sheet.addRow(APARTMENT_IMPORT_COLUMNS.map(({ header }) => header));
  rows.forEach((row) =>
    sheet.addRow(APARTMENT_IMPORT_COLUMNS.map(({ key }) => row[key] ?? '')),
  );
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    originalname: 'apartments.xlsx',
    mimetype: APARTMENT_IMPORT.MIME_TYPE,
    fieldname: 'file',
    encoding: '7bit',
    size: buffer.length,
    stream: Readable.from([buffer]),
    destination: '',
    filename: '',
    path: '',
  };
};
