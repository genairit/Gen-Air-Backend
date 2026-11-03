import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ProjectIntakeDetailsDto } from './project-intake-details.dto';

const findInvalidFields = async (payload: object): Promise<string[]> => {
  const errors = await validate(
    plainToInstance(ProjectIntakeDetailsDto, payload),
  );

  return errors.map((error) => error.property);
};

describe('ProjectIntakeDetailsDto', () => {
  it('accepts a complete, well-formed intake', async () => {
    await expect(
      findInvalidFields({
        contactName: 'דנה לוי',
        contactPhone: '052-7788990',
        contactRole: 'מנהלת פרויקט',
        addressPlaceId: 'ChIJzzwIwJxMHRUR3Ywnw4yVUl0',
      }),
    ).resolves.toEqual([]);
  });

  it('accepts a mobile number without a dash', async () => {
    await expect(
      findInvalidFields({ contactPhone: '0527788990' }),
    ).resolves.toEqual([]);
  });

  it('rejects a landline as the contact phone', async () => {
    await expect(
      findInvalidFields({ contactPhone: '03-1234567' }),
    ).resolves.toEqual(['contactPhone']);
  });

  it('rejects a one-character contact name', async () => {
    await expect(findInvalidFields({ contactName: 'ד' })).resolves.toEqual([
      'contactName',
    ]);
  });

  it('rejects a place id with characters Google never uses', async () => {
    await expect(
      findInvalidFields({ addressPlaceId: '../places/ChIJ' }),
    ).resolves.toEqual(['addressPlaceId']);
  });

  it('accepts null so the service can report a cleared required field', async () => {
    await expect(
      findInvalidFields({ contactName: null, addressPlaceId: null }),
    ).resolves.toEqual([]);
  });
});
