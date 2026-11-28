import {
  CreateEngineeringEstimateDto,
  PreviewEngineeringEstimateDto,
} from './engineering-estimate.dto';

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { EstimateSketchDto } from './engineering-estimate.dto';
import { UpdateEngineeringEstimateDto } from './engineering-estimate.dto';

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe('Estimate nested DTO validation', (): void => {
  const area = {
    id: randomUUID(),
    name: 'אזור',
    repeatCount: 1,
  };
  const line = {
    id: randomUUID(),
    catalogueItemId: randomUUID(),
    quantity: '1',
  };

  it('rejects arrays masquerading as measurement objects or array members', async (): Promise<void> => {
    const invalidInputs = [
      { version: 1, areas: [[]] },
      { version: 1, areas: [{ ...area, lines: [[]] }] },
      {
        version: 1,
        areas: [{ ...area, lines: [{ ...line, measurements: [] }] }],
      },
      {
        version: 1,
        areas: [
          {
            ...area,
            lines: [
              {
                ...line,
                measurements: {
                  equipment: 'other',
                  pipeMetresIncludingRise: 0,
                  shelterSupply: false,
                  distribution: [],
                },
              },
            ],
          },
        ],
      },
      { version: 1, questions: [[]] },
    ];
    for (const input of invalidInputs) {
      await expect(
        validation.transform(input, {
          type: 'body',
          metatype: UpdateEngineeringEstimateDto,
        }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('rejects malformed or duplicate plan-to-area sample mappings', async (): Promise<void> => {
    const sample = { areaId: randomUUID(), planId: randomUUID() };
    const invalidSamples = [
      [null],
      [[]],
      [sample, { ...sample, planId: randomUUID() }],
    ];
    for (const samples of invalidSamples) {
      await expect(
        validation.transform(
          { version: 1, samples },
          { type: 'body', metatype: EstimateSketchDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    }
  });
});

describe('Estimate preview and initial contents validation', (): void => {
  const area = {
    id: randomUUID(),
    name: 'אזור',
    repeatCount: 3,
    lines: [{ id: randomUUID(), catalogueItemId: randomUUID(), quantity: '2' }],
  };

  it('accepts a complete draft and legacy name-only create', async (): Promise<void> => {
    await expect(
      validation.transform(
        { scope: 'hvac', areas: [area] },
        { type: 'body', metatype: PreviewEngineeringEstimateDto },
      ),
    ).resolves.toMatchObject({ areas: [area] });
    await expect(
      validation.transform(
        { name: 'טיוטה', scope: 'hvac', areas: [area] },
        { type: 'body', metatype: CreateEngineeringEstimateDto },
      ),
    ).resolves.toMatchObject({ areas: [area] });
    await expect(
      validation.transform(
        { name: 'טיוטה' },
        { type: 'body', metatype: CreateEngineeringEstimateDto },
      ),
    ).resolves.toMatchObject({ name: 'טיוטה' });
  });

  it.each([
    {},
    { scope: 'hvac', areas: [[]] },
    { scope: 'hvac', areas: [{ ...area, repeatCount: 0 }] },
    { scope: 'unknown', areas: [] },
  ])('rejects malformed preview contents %j', async (body): Promise<void> => {
    await expect(
      validation.transform(body, {
        type: 'body',
        metatype: PreviewEngineeringEstimateDto,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('validates nested contents on create', async (): Promise<void> => {
    await expect(
      validation.transform(
        {
          name: 'טיוטה',
          areas: [{ ...area, lines: [{ ...area.lines[0], quantity: '0' }] }],
        },
        { type: 'body', metatype: CreateEngineeringEstimateDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
