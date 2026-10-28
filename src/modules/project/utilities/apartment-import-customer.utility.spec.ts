import {
  readApartmentImportField,
  readApartmentCustomerIdentity,
  compareApartmentImportCustomer,
  prepareApartmentImportCustomer,
  mergeApartmentCustomerDeclaration,
} from './apartment-import-customer.utility';

import {
  APARTMENT_IMPORT_CUSTOMER_TYPES,
  APARTMENT_IMPORT_CUSTOMER_FIELDS,
  type ApartmentImportColumnKeyType,
} from '../constants/apartment-import-customer.constant';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { CreateCustomerDto } from '@Modules/customer/dto/create-customer.dto';
import { APARTMENT_IMPORT_COLUMNS } from '../constants/apartment-import.constant';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';

const CUSTOMER_CELLS = {
  customerName: 'לקוח לדוגמה',
  customerTaxId: '000000018',
  customerAddress: 'רחוב לדוגמה 12',
  contactName: 'איש קשר',
  customerPhone: '0501234567',
  customerEmail: 'customer@example.com',
  customerType: 'חברה',
  contactPhone: '0527654321',
  contactEmail: 'secondary@example.com',
} satisfies Partial<Record<ApartmentImportColumnKeyType, string>>;

const makeCells = (
  overrides: Partial<Record<ApartmentImportColumnKeyType, string>> = {},
): string[] => {
  const fields: Partial<Record<ApartmentImportColumnKeyType, string>> = {
    ...CUSTOMER_CELLS,
    ...overrides,
  };
  return APARTMENT_IMPORT_COLUMNS.map(({ key }) => fields[key] ?? '');
};

describe('apartment customer identity', () => {
  it('requires only a valid tax ID for matching, preserving leading zeroes', () => {
    const cells = APARTMENT_IMPORT_COLUMNS.map(({ key }) =>
      key === APARTMENT_IMPORT_CUSTOMER_FIELDS.taxId ? '  000000018  ' : '',
    );
    expect(readApartmentCustomerIdentity(cells)).toEqual({
      taxId: '000000018',
      errors: [],
    });
  });

  it.each(['', '   ', '514287938', '12345678', '1234567890', '514-287937'])(
    'rejects missing or invalid identity %p',
    (customerTaxId) => {
      const result = readApartmentCustomerIdentity(
        makeCells({ customerTaxId }),
      );
      expect(result.taxId).toBeNull();
      expect(result.errors).toHaveLength(1);
    },
  );

  it('handles absent cells without coercing or inventing identity', () => {
    expect(
      readApartmentImportField([], APARTMENT_IMPORT_CUSTOMER_FIELDS.taxId),
    ).toBe('');
    expect(readApartmentCustomerIdentity([]).taxId).toBeNull();
  });
});

describe('new apartment import customer', () => {
  it.each(APARTMENT_IMPORT_CUSTOMER_TYPES)(
    'maps the approved Hebrew type $label to $value',
    async ({ label, value }) => {
      const result = await prepareApartmentImportCustomer(
        makeCells({ customerType: label }),
      );
      expect(result.errors).toEqual([]);
      expect(result.customer?.customerType).toBe(value);
      expect(result.customer?.taxId).toBe('000000018');
    },
  );

  it.each(Object.values(APARTMENT_IMPORT_CUSTOMER_FIELDS))(
    'requires %s for new customers through the existing DTO',
    async (key) => {
      const result = await prepareApartmentImportCustomer(
        makeCells({ [key]: '' }),
      );
      expect(result.customer).toBeNull();
      expect(result.errors).toHaveLength(1);
    },
  );

  it('trims all inputs and maps customer phone/email rather than secondary contacts', async () => {
    const padded = makeCells().map((value) => `  ${value}  `);
    const result = await prepareApartmentImportCustomer(padded);
    expect(result.errors).toEqual([]);
    expect(result.customer).toMatchObject({
      name: CUSTOMER_CELLS.customerName,
      address: CUSTOMER_CELLS.customerAddress,
      contactName: CUSTOMER_CELLS.contactName,
      phone: CUSTOMER_CELLS.customerPhone,
      email: CUSTOMER_CELLS.customerEmail,
      taxId: CUSTOMER_CELLS.customerTaxId,
    });
  });

  it('returns field errors without copying private supplied values', async () => {
    const privateValue = 'private-invalid-personal-email';
    const result = await prepareApartmentImportCustomer(
      makeCells({ customerEmail: privateValue }),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors.join()).not.toContain(privateValue);
  });

  it.each([
    { customerType: 'company' },
    { customerType: 'לא ידוע' },
    { customerTaxId: '514287938' },
    { customerName: 'א' },
    { customerName: 'א'.repeat(FIELD_LENGTHS.CUSTOMER_NAME + 1) },
    { customerAddress: 'א' },
    { contactName: 'א' },
    { customerPhone: '123' },
    { customerEmail: 'invalid' },
  ])('returns row errors for DTO-invalid values %p', async (overrides) => {
    const result = await prepareApartmentImportCustomer(makeCells(overrides));
    expect(result.customer).toBeNull();
    expect(result.errors).toHaveLength(1);
  });
});

const STORED_CUSTOMER: CreateCustomerDto = {
  name: CUSTOMER_CELLS.customerName,
  taxId: CUSTOMER_CELLS.customerTaxId,
  address: CUSTOMER_CELLS.customerAddress,
  phone: CUSTOMER_CELLS.customerPhone,
  email: CUSTOMER_CELLS.customerEmail,
  contactName: CUSTOMER_CELLS.contactName,
  customerType: PROJECT_DETAIL_FIELD_SETS.COMPANY,
};

describe('existing apartment customer consistency', () => {
  it('accepts matching supplied values without changing the stored customer', () => {
    const before = { ...STORED_CUSTOMER };
    expect(
      compareApartmentImportCustomer({
        cells: makeCells(),
        customer: STORED_CUSTOMER,
      }),
    ).toEqual([]);
    expect(STORED_CUSTOMER).toEqual(before);
  });

  it('ignores omitted fields and unresolved secondary-contact ownership', () => {
    const cells = APARTMENT_IMPORT_COLUMNS.map(({ key }) =>
      key === APARTMENT_IMPORT_CUSTOMER_FIELDS.taxId
        ? CUSTOMER_CELLS.customerTaxId
        : '',
    );
    expect(
      compareApartmentImportCustomer({ cells, customer: STORED_CUSTOMER }),
    ).toEqual([]);
    expect(
      compareApartmentImportCustomer({
        cells: makeCells({
          contactName: 'איש קשר אחר',
          contactPhone: '039876543',
          contactEmail: 'other@example.com',
        }),
        customer: STORED_CUSTOMER,
      }),
    ).toEqual([]);
  });

  it('normalizes only whitespace, email case and phone hyphens', () => {
    expect(
      compareApartmentImportCustomer({
        cells: makeCells({
          customerName: ` ${CUSTOMER_CELLS.customerName} `,
          customerEmail: 'CUSTOMER@EXAMPLE.COM',
          customerPhone: '050-1234567',
        }),
        customer: STORED_CUSTOMER,
      }),
    ).toEqual([]);
  });

  it.each([
    { customerName: 'לקוח אחר' },
    { customerTaxId: '514287937' },
    { customerAddress: 'כתובת אחרת' },
    { customerEmail: 'another@example.com' },
    { customerPhone: '0521234567' },
    { customerPhone: '501234567' },
    { customerType: 'מוסד' },
    { customerType: 'company' },
  ])(
    'rejects a supplied mismatch without disclosing stored values %p',
    (overrides) => {
      const errors = compareApartmentImportCustomer({
        cells: makeCells(overrides),
        customer: STORED_CUSTOMER,
      });
      expect(errors).toEqual(['פרטי הלקוח שסופקו אינם תואמים ללקוח הקיים']);
    },
  );

  it('can compare a later workbook row against a previously prepared customer', async () => {
    const prepared = await prepareApartmentImportCustomer(makeCells());
    expect(prepared.customer).not.toBeNull();
    if (!prepared.customer) {
      throw new Error('Expected valid fixture');
    }

    expect(
      compareApartmentImportCustomer({
        cells: makeCells({ customerName: 'שם שונה' }),
        customer: prepared.customer,
      }),
    ).toHaveLength(1);
  });
});

describe('in-workbook customer declarations', () => {
  it('records identity independently of whether a row is later persisted', () => {
    const first = makeCells();
    const snapshot = [...first];
    const declaration = mergeApartmentCustomerDeclaration({
      previous: null,
      cells: first,
    });
    const next = mergeApartmentCustomerDeclaration({
      previous: declaration.cells,
      cells: makeCells({ customerName: 'שם אחר' }),
    });
    expect(declaration.errors).toEqual([]);
    expect(next.errors).toHaveLength(1);
    expect(next.cells).toEqual(declaration.cells);
    expect(first).toEqual(snapshot);
  });

  it('merges newly supplied identity so a third conflicting row is rejected', () => {
    const first = mergeApartmentCustomerDeclaration({
      previous: null,
      cells: makeCells({ customerName: '' }),
    });
    const second = mergeApartmentCustomerDeclaration({
      previous: first.cells,
      cells: makeCells({ customerName: 'שם שני' }),
    });
    const third = mergeApartmentCustomerDeclaration({
      previous: second.cells,
      cells: makeCells({ customerName: 'שם שלישי' }),
    });
    expect(second.errors).toEqual([]);
    expect(
      readApartmentImportField(
        second.cells,
        APARTMENT_IMPORT_CUSTOMER_FIELDS.name,
      ),
    ).toBe('שם שני');
    expect(third.errors).toHaveLength(1);
    expect(third.cells).toEqual(second.cells);
  });

  it('ignores omitted later identity and normalizes supplied phone and email', () => {
    const first = mergeApartmentCustomerDeclaration({
      previous: null,
      cells: makeCells(),
    });
    const second = mergeApartmentCustomerDeclaration({
      previous: first.cells,
      cells: makeCells({
        customerName: ' ',
        customerAddress: '',
        customerPhone: '050-1234567',
        customerEmail: ' CUSTOMER@EXAMPLE.COM ',
        customerType: ' חברה ',
      }),
    });
    expect(second.errors).toEqual([]);
    expect(
      readApartmentImportField(
        second.cells,
        APARTMENT_IMPORT_CUSTOMER_FIELDS.name,
      ),
    ).toBe(CUSTOMER_CELLS.customerName);
  });

  it('does not compare or retain the secondary contact tuple and apartment values', () => {
    const first = mergeApartmentCustomerDeclaration({
      previous: null,
      cells: makeCells(),
    });
    const second = mergeApartmentCustomerDeclaration({
      previous: first.cells,
      cells: makeCells({
        contactName: 'איש קשר חדש',
        contactPhone: '039876543',
        contactEmail: 'other@example.com',
        apartment: '99',
        floor: '7',
      }),
    });
    expect(second.errors).toEqual([]);
    expect(
      readApartmentImportField(
        second.cells,
        APARTMENT_IMPORT_CUSTOMER_FIELDS.contactName,
      ),
    ).toBe('');
    expect(readApartmentImportField(second.cells, 'apartment')).toBe('');
  });

  it('compares different Hebrew types and distinct unrecognized labels conservatively', () => {
    const first = mergeApartmentCustomerDeclaration({
      previous: null,
      cells: makeCells(),
    });
    expect(
      mergeApartmentCustomerDeclaration({
        previous: first.cells,
        cells: makeCells({ customerType: 'מוסד' }),
      }).errors,
    ).toHaveLength(1);
    const invalid = mergeApartmentCustomerDeclaration({
      previous: null,
      cells: makeCells({ customerType: 'לא מוכר' }),
    });
    expect(
      mergeApartmentCustomerDeclaration({
        previous: invalid.cells,
        cells: makeCells({ customerType: 'אחר' }),
      }).errors,
    ).toHaveLength(1);
  });
});
