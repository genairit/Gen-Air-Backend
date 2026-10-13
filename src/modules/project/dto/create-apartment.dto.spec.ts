import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateApartmentDto } from './create-apartment.dto';

const findInvalidFields = async (payload: object): Promise<string[]> => {
  const errors = await validate(plainToInstance(CreateApartmentDto, payload));

  return errors.map((error) => error.property);
};

const APARTMENT = {
  customerFloor: 3,
  customerApartment: '12',
  contactName: 'דנה לוי',
  contactPhone: '052-7788990',
  contactRole: 'נציגת דיירים',
};

describe('CreateApartmentDto', () => {
  it('accepts an apartment with its floor, number and contact person', async () => {
    await expect(findInvalidFields(APARTMENT)).resolves.toEqual([]);
  });

  it('accepts an optional end customer with a landline', async () => {
    await expect(
      findInvalidFields({
        ...APARTMENT,
        customerName: 'משפחת כהן',
        customerPhone: '03-5551234',
      }),
    ).resolves.toEqual([]);
  });

  it('requires the floor, the apartment number and the whole contact person', async () => {
    await expect(findInvalidFields({})).resolves.toEqual([
      'customerFloor',
      'customerApartment',
      'contactName',
      'contactPhone',
      'contactRole',
    ]);
  });

  it('rejects a non-numeric floor and a landline contact phone', async () => {
    await expect(
      findInvalidFields({
        ...APARTMENT,
        customerFloor: 'שלישית',
        contactPhone: '03-5551234',
      }),
    ).resolves.toEqual(['customerFloor', 'contactPhone']);
  });
});
