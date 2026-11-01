import 'reflect-metadata';
import { validate } from 'class-validator';
import { CreateProjectDto } from './create-project.dto';
import { UpdateProjectDto } from './update-project.dto';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { ProjectNameAvailabilityDto } from './project-name-availability.dto';

interface IProjectNameInput {
  name?: string;
}

const nameDtos: readonly ClassConstructor<IProjectNameInput>[] = [
  CreateProjectDto,
  UpdateProjectDto,
  ProjectNameAvailabilityDto,
];

const existingId = '11111111-1111-4111-8111-111111111111';
const errorsFor = (value: object) =>
  validate(plainToInstance(ProjectNameAvailabilityDto, value), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('exact project name transport rules', () => {
  it.each(nameDtos)(
    'normalizes only outer JavaScript whitespace in %p',
    (dto) => {
      const transformed = plainToInstance(dto, {
        name: '\u00a0\ufeff\tBuilding  A\u3000\r\n',
      });
      expect(transformed.name).toBe('Building  A');
    },
  );

  it.each([
    'Building A',
    'building A',
    'בניין  א',
    'א'.repeat(FIELD_LENGTHS.PROJECT_NAME),
  ])(
    'preserves case, internal whitespace and supported names: %s',
    async (name) => {
      expect(await errorsFor({ name, excludeId: existingId })).toEqual([]);
      expect(plainToInstance(ProjectNameAvailabilityDto, { name }).name).toBe(
        name,
      );
    },
  );

  it.each([
    {},
    { name: '' },
    { name: ' \u00a0\t' },
    { name: 42 },
    { name: 'א'.repeat(FIELD_LENGTHS.PROJECT_NAME + 1) },
    { name: 'valid', excludeId: 'not-a-uuid' },
    { name: 'valid', excludeId: '' },
    { name: 'valid', customerId: existingId },
  ])('rejects an invalid or broadened query %p', async (value) => {
    expect((await errorsFor(value)).length).toBeGreaterThan(0);
  });
});
