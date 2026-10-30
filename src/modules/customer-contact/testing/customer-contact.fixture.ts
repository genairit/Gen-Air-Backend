import { ICustomerContact } from '../interfaces/customer-contact.interface';

export const CONTACT_TEST_IDS = {
  CUSTOMER: '11111111-1111-4111-8111-111111111111',
  CONTACT: '22222222-2222-4222-8222-222222222222',
  OTHER_CUSTOMER: '33333333-3333-4333-8333-333333333333',
  USER: '44444444-4444-4444-8444-444444444444',
} as const;

export const CONTACT_INPUT = {
  name: 'דנה ישראלי',
  phone: '0521234567',
  email: 'dana@example.com',
  role: 'מנהלת',
};

export const STORED_CONTACT: ICustomerContact = {
  ...CONTACT_INPUT,
  id: CONTACT_TEST_IDS.CONTACT,
  customerId: CONTACT_TEST_IDS.CUSTOMER,
  createdById: CONTACT_TEST_IDS.USER,
  createdAt: new Date('2026-10-28T00:00:00Z'),
  updatedAt: new Date('2026-10-28T00:00:00Z'),
  deletedAt: null,
};
