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
        addressPlaceId: 'ChIJzzwIwJxMHRUR3Ywnw4yVUl0',
      }),
    ).resolves.toEqual([]);
  });

  it('rejects a place id with characters Google never uses', async () => {
    await expect(
      findInvalidFields({ addressPlaceId: '../places/ChIJ' }),
    ).resolves.toEqual(['addressPlaceId']);
  });

  it('accepts null so the service can report a cleared required field', async () => {
    await expect(findInvalidFields({ addressPlaceId: null })).resolves.toEqual(
      [],
    );
  });
});
