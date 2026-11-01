import 'reflect-metadata';
import { validate } from 'class-validator';
import { CreateProjectDto } from './create-project.dto';
import { UpdateProjectDto } from './update-project.dto';
import { ProjectLightingDto } from './project-lighting.dto';
import { plainToInstance, ClassConstructor } from 'class-transformer';

const errorsFor = (value: object) =>
  validate(plainToInstance(ProjectLightingDto, value), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('project lighting transport validation', () => {
  it.each([
    {},
    { hasGeneralLightingCeilingLowering: false },
    { hasGeneralLightingCeilingLowering: true },
    { generalLightingCeilingLoweringHeight: null },
    { generalLightingCeilingLoweringHeight: 0 },
    { generalLightingCeilingLoweringHeight: 25.125 },
    {
      hasGeneralLightingCeilingLowering: true,
      generalLightingCeilingLoweringHeight: 25,
    },
  ])(
    'accepts typed full or partial values %p for service-state validation',
    async (value) => {
      expect(await errorsFor(value)).toEqual([]);
    },
  );

  it.each([
    { hasGeneralLightingCeilingLowering: null },
    { hasGeneralLightingCeilingLowering: 'true' },
    { hasGeneralLightingCeilingLowering: 1 },
    { generalLightingCeilingLoweringHeight: '25' },
    { generalLightingCeilingLoweringHeight: 'twenty' },
    { generalLightingCeilingLoweringHeight: true },
    { generalLightingCeilingLoweringHeight: -0.1 },
    { generalLightingCeilingLoweringHeight: Number.NaN },
    { generalLightingCeilingLoweringHeight: Number.POSITIVE_INFINITY },
    { generalLightingCeilingLoweringHeight: Number.NEGATIVE_INFINITY },
    { unexpectedLightingField: 1 },
  ])('rejects invalid transport values %p', async (value) => {
    expect((await errorsFor(value)).length).toBeGreaterThan(0);
  });
});

const projectDtos: readonly ClassConstructor<ProjectLightingDto>[] = [
  CreateProjectDto,
  UpdateProjectDto,
];

describe('lighting fields in project create and update transport', () => {
  const creation = {
    name: 'תאורה',
    projectTypeId: '11111111-1111-4111-8111-111111111111',
    customerId: '11111111-1111-4111-8111-111111111112',
    members: [],
  };

  it.each(projectDtos)(
    'keeps validated lighting fields through %p whitelist',
    async (dto) => {
      const input = {
        ...creation,
        hasGeneralLightingCeilingLowering: true,
        generalLightingCeilingLoweringHeight: 25.125,
      };
      const value = plainToInstance(dto, input);
      expect(
        await validate(value, { whitelist: true, forbidNonWhitelisted: true }),
      ).toEqual([]);
      expect(value).toMatchObject({
        hasGeneralLightingCeilingLowering: true,
        generalLightingCeilingLoweringHeight: 25.125,
      });
    },
  );

  it.each(projectDtos)(
    'independently rejects non-numeric lighting height through %p',
    async (dto) => {
      const value = plainToInstance(dto, {
        ...creation,
        hasGeneralLightingCeilingLowering: true,
        generalLightingCeilingLoweringHeight: '25',
      });
      expect(
        (await validate(value)).some(
          (error) => error.property === 'generalLightingCeilingLoweringHeight',
        ),
      ).toBe(true);
    },
  );
});
