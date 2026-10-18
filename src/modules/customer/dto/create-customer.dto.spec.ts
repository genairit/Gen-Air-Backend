import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCustomerDto } from './create-customer.dto';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { PROJECT_DETAIL_FIELD_SETS } from '@Constants/project-detail-field-set.constant';

const CUSTOMER_INPUT = {
  taxId: '514287937',
  name: 'לקוח לבדיקה',
  phone: '03-1234567',
  email: 'office@example.com',
  address: 'הרצל 12 תל אביב',
  contactName: 'ישראל ישראלי',
  customerType: PROJECT_DETAIL_FIELD_SETS.COMPANY,
};

const invalidFields = async (input: object): Promise<string[]> => {
  const errors = await validate(plainToInstance(CreateCustomerDto, input));
  return errors.map((error) => error.property);
};

describe('CreateCustomerDto', () => {
  it.each([
    '03-1234567',
    '031234567',
    '052-1234567',
    '0521234567',
    '077-1234567',
  ])('accepts a complete customer with phone %s', async (phone) => {
    await expect(invalidFields({ ...CUSTOMER_INPUT, phone })).resolves.toEqual(
      [],
    );
  });

  it.each(Object.values(PROJECT_DETAIL_FIELD_SETS))(
    'accepts customer type %s',
    async (customerType) => {
      await expect(
        invalidFields({ ...CUSTOMER_INPUT, customerType }),
      ).resolves.toEqual([]);
    },
  );

  it('trims text before validation without coercing types', async () => {
    const padded = Object.fromEntries(
      Object.entries(CUSTOMER_INPUT).map(([key, value]) => [
        key,
        key === 'customerType' ? value : `  ${value}  `,
      ]),
    );
    const customer = plainToInstance(CreateCustomerDto, padded);
    expect(await validate(customer)).toEqual([]);
    expect(customer).toEqual(CUSTOMER_INPUT);
  });

  it.each(Object.keys(CUSTOMER_INPUT))('requires %s', async (field) => {
    const missing = Object.fromEntries(
      Object.entries(CUSTOMER_INPUT).filter(([key]) => key !== field),
    );
    await expect(invalidFields(missing)).resolves.toEqual([field]);
  });

  it.each(
    Object.keys(CUSTOMER_INPUT).flatMap((field) =>
      [null, '', '   ', 123, {}, []].map((value) => ({ field, value })),
    ),
  )('rejects $field = $value', async ({ field, value }) => {
    await expect(
      invalidFields({ ...CUSTOMER_INPUT, [field]: value }),
    ).resolves.toEqual([field]);
  });

  it.each([
    ['name', 'א'],
    ['name', 'א'.repeat(FIELD_LENGTHS.CUSTOMER_NAME + 1)],
    ['address', 'א'],
    ['address', 'א'.repeat(FIELD_LENGTHS.STREET_ADDRESS + 1)],
    ['contactName', 'א'],
    ['contactName', 'א'.repeat(FIELD_LENGTHS.CONTACT_NAME + 1)],
    ['taxId', '514287938'],
    ['taxId', '51428793'],
    ['taxId', '5142879370'],
    ['taxId', 'abc287937'],
    ['email', 'office@'],
    ['email', 'bad email@example.com'],
    ['email', `${'a'.repeat(FIELD_LENGTHS.EMAIL)}@example.com`],
    ['phone', '1234567'],
    ['phone', '052 1234567'],
    ['phone', '+972521234567'],
    ['customerType', 'unrecognized'],
  ])('rejects invalid %s = %p', async (field, value) => {
    await expect(
      invalidFields({ ...CUSTOMER_INPUT, [field]: value }),
    ).resolves.toEqual([field]);
  });
});
