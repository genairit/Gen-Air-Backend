import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProjectDto } from './update-project.dto';
import { CreateProjectDto } from './create-project.dto';

const CUSTOMER_ID = '6f1c2b8e-3d4a-4b5c-9e7f-0a1b2c3d4e5f';

const NEW_PROJECT = {
  members: [],
  name: 'מגדל פארק בבלי C',
  projectTypeId: '0b8c1d2e-3f4a-4b5c-8d9e-0f1a2b3c4d5e',
};

const findInvalidFields = async <T extends object>(
  dto: new () => T,
  payload: object,
): Promise<string[]> => {
  const errors = await validate(plainToInstance(dto, payload));

  return errors.map((error) => error.property);
};

describe('CreateProjectDto customer link', () => {
  it('accepts a project linked to a customer', async () => {
    await expect(
      findInvalidFields(CreateProjectDto, {
        ...NEW_PROJECT,
        customerId: CUSTOMER_ID,
      }),
    ).resolves.not.toContain('customerId');
  });

  it('requires a customer', async () => {
    await expect(
      findInvalidFields(CreateProjectDto, NEW_PROJECT),
    ).resolves.toContain('customerId');
  });
});

describe('UpdateProjectDto customer link', () => {
  it('leaves the customer alone when the change omits it', async () => {
    await expect(
      findInvalidFields(UpdateProjectDto, { name: 'שם חדש' }),
    ).resolves.toEqual([]);
  });

  it('accepts switching to another customer', async () => {
    await expect(
      findInvalidFields(UpdateProjectDto, { customerId: CUSTOMER_ID }),
    ).resolves.toEqual([]);
  });

  it('rejects unlinking the customer', async () => {
    await expect(
      findInvalidFields(UpdateProjectDto, { customerId: null }),
    ).resolves.toEqual(['customerId']);
  });
});
