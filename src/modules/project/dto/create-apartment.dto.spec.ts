import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProjectDto } from './update-project.dto';
import { CreateApartmentDto } from './create-apartment.dto';
import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';

const APARTMENT = {
  customerFloor: 3,
  customerApartment: '24',
  customerId: '00000000-0000-4000-8000-000000000001',
};

const findInvalidFields = async (payload: object): Promise<string[]> => {
  const errors = await validate(plainToInstance(CreateApartmentDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
};

describe('CreateApartmentDto', () => {
  it('accepts an existing customer link without repeating customer or contact text', async () => {
    await expect(findInvalidFields(APARTMENT)).resolves.toEqual([]);
  });

  it('requires a floor, number and customer UUID', async () => {
    await expect(findInvalidFields({})).resolves.toEqual([
      'customerFloor',
      'customerApartment',
      'customerId',
    ]);
  });

  it.each(['24', '24א', '101ב'])(
    'accepts apartment number %s',
    async (customerApartment) => {
      await expect(
        findInvalidFields({ ...APARTMENT, customerApartment }),
      ).resolves.toEqual([]);
    },
  );

  it.each(['א24', '24ab', '24אב', '24/1', ' 24', '24 '])(
    'rejects malformed apartment number %s',
    async (customerApartment) => {
      await expect(
        findInvalidFields({ ...APARTMENT, customerApartment }),
      ).resolves.toEqual(['customerApartment']);
    },
  );

  it.each([null, '', 'not-a-uuid'])(
    'rejects invalid customer link %s',
    async (customerId) => {
      await expect(
        findInvalidFields({ ...APARTMENT, customerId }),
      ).resolves.toEqual(['customerId']);
    },
  );

  it.each(['שלישית', 1.5, -1000, 1000])(
    'rejects invalid floor %s',
    async (customerFloor) => {
      await expect(
        findInvalidFields({ ...APARTMENT, customerFloor }),
      ).resolves.toEqual(['customerFloor']);
    },
  );

  it('accepts an explicit empty own team and optional payment terms', async () => {
    await expect(
      findInvalidFields({
        ...APARTMENT,
        members: [],
        paymentTerms: PAYMENT_TERMS.OTHER,
        paymentTermsNote: 'תשלום מלא במסירה',
      }),
    ).resolves.toEqual([]);
  });

  it('rejects obsolete free-text customer and contact fields', async () => {
    await expect(
      findInvalidFields({
        ...APARTMENT,
        customerName: 'משפחת כהן',
        customerPhone: '052-7788990',
        contactName: 'דנה לוי',
        contactPhone: '052-7788990',
        contactRole: 'דיירת',
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        'customerName',
        'customerPhone',
        'contactName',
        'contactPhone',
        'contactRole',
      ]),
    );
  });
});

describe('UpdateProjectDto apartment team mode', () => {
  it.each([true, false])(
    'accepts explicit hasOwnTeam %s',
    async (hasOwnTeam) => {
      const errors = await validate(
        plainToInstance(UpdateProjectDto, { hasOwnTeam }),
      );
      expect(errors).toEqual([]);
    },
  );

  it.each([null, 'false', 0])(
    'rejects invalid hasOwnTeam %s',
    async (hasOwnTeam) => {
      const errors = await validate(
        plainToInstance(UpdateProjectDto, { hasOwnTeam }),
      );
      expect(errors.map((error) => error.property)).toEqual(['hasOwnTeam']);
    },
  );
});
