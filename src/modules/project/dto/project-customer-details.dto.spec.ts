import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ProjectCustomerDetailsDto } from './project-customer-details.dto';

const findInvalidFields = async (payload: object): Promise<string[]> => {
  const errors = await validate(
    plainToInstance(ProjectCustomerDetailsDto, payload),
  );

  return errors.map((error) => error.property);
};

describe('ProjectCustomerDetailsDto', () => {
  it('accepts a complete, well-formed set of details', async () => {
    await expect(
      findInvalidFields({
        customerFloor: -1,
        customerApartment: '24',
        customerName: 'בבלי נדל״ן',
        customerPhone: '03-1234567',
        customerCompanyNumber: '514287937',
        customerAssociationNumber: '580123456',
        customerEmail: 'office@babli-re.co.il',
      }),
    ).resolves.toEqual([]);
  });

  it('accepts null so a client can clear a field', async () => {
    await expect(
      findInvalidFields({ customerCity: null, customerFloor: null }),
    ).resolves.toEqual([]);
  });

  it.each([
    ['customerCompanyNumber', '514287938'],
    ['customerAssociationNumber', '570123456'],
    ['customerPhone', '1234567'],
    ['customerPhone', '052 1234567'],
    ['customerEmail', 'office@'],
    ['customerFloor', 1.5],
    ['customerFloor', 1000],
    ['customerName', ''],
    ['customerApartment', '12345678901'],
  ])('rejects %s = %p', async (field, value) => {
    await expect(findInvalidFields({ [field]: value })).resolves.toEqual([
      field,
    ]);
  });
});
