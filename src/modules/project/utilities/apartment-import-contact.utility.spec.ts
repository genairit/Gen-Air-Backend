import { validateApartmentImportContacts } from './apartment-import-contact.utility';

const contacts = (phone: string, email: string): string[] => [
  '',
  '',
  '',
  '',
  phone,
  email,
  '',
  phone,
  email,
  '',
];

describe('supplied apartment import contact values', () => {
  it('does not impose unapproved requiredness', () => {
    expect(validateApartmentImportContacts([])).toEqual([]);
  });

  it('uses existing Israeli phone and email conventions', () => {
    expect(
      validateApartmentImportContacts(
        contacts('0501234567', 'person@example.com'),
      ),
    ).toEqual([]);
    expect(
      validateApartmentImportContacts(
        contacts('03-1234567', 'person@example.com'),
      ),
    ).toEqual([]);
  });

  it('rejects overlong emails for both customer and contact', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`;
    expect(email.length).toBeGreaterThan(254);
    expect(validateApartmentImportContacts(contacts('', email))).toHaveLength(
      2,
    );
  });

  it('reports both customer and contact invalid values', () => {
    const errors = validateApartmentImportContacts(
      contacts('501234567', 'bad-email'),
    );
    expect(errors).toHaveLength(4);
    expect(errors.join()).toContain('טלפון לקוח');
    expect(errors.join()).toContain('טלפון איש קשר');
  });
});
