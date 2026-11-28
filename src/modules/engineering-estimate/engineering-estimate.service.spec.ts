import {
  ESTIMATE_SCOPE,
  ESTIMATE_SETUP_STEP,
} from './constants/engineering-estimate.constant';

import type {
  IEstimateRecord,
  IEstimateListRow,
} from './interfaces/engineering-estimate.interface';

import 'reflect-metadata';
import { Transaction } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { mock } from 'jest-mock-extended';
import { ValidationPipe } from '@nestjs/common';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ProjectService } from '@Modules/project/project.service';
import { EstimatePricingService } from './estimate-pricing.service';
import { EngineeringEstimateService } from './engineering-estimate.service';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { UpdateEngineeringEstimateDto } from './dto/engineering-estimate.dto';
import { EngineeringEstimateRepository } from './engineering-estimate.repository';
import { ProjectDriveService } from '@Modules/project-drive/project-drive.service';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

interface IUpdateScenario {
  name: string;
  body: object;
  copiedPlans: boolean;
  target: string | null;
}

const setup = (projectId: string | null, copiedPlans: boolean) => {
  const transaction = mock<Transaction>();
  const repository = mock<EngineeringEstimateRepository>();
  const projects = mock<ProjectService>();
  const transactions = mock<DatabaseTransactionService>();
  const pricing = mock<EstimatePricingService>();
  const actor = mock<IAuthorizedUser>({
    id: randomUUID(),
    permissions: [
      PERMISSIONS.ENGINEERING_ESTIMATES_READ,
      PERMISSIONS.PROJECTS_READ,
    ],
  });
  const record: IEstimateRecord = {
    id: randomUUID(),
    name: 'טיוטה',
    version: 1,
    projectId,
    createdById: actor.id,
    updatedAt: new Date(),
    scope: ESTIMATE_SCOPE.HVAC,
    setupStep: ESTIMATE_SETUP_STEP.PROJECT,
    areas: [],
    questions: [],
  };
  transactions.run.mockImplementation((work): ReturnType<typeof work> =>
    work(transaction),
  );
  repository.find.mockResolvedValue(record);
  repository.hasCopiedPlans.mockResolvedValue(copiedPlans);
  pricing.calculate.mockResolvedValue([]);
  const service = new EngineeringEstimateService(
    repository,
    transactions,
    projects,
    mock<ProjectDriveService>(),
    pricing,
  );
  repository.plans.mockResolvedValue([]);
  return { actor, record, repository, service, pricing, transaction };
};

describe('Engineer estimate project link patch', (): void => {
  const projectId = randomUUID();
  const newProject = randomUUID();
  const scenarios: IUpdateScenario[] = [
    {
      name: 'preserves an omitted link even with copied plans',
      body: { name: 'טיוטה מעודכנת' },
      copiedPlans: true,
      target: projectId,
    },
    {
      name: 'changes an explicit UUID link when no plans were copied',
      body: { projectId: newProject },
      copiedPlans: false,
      target: newProject,
    },
  ];

  it('cannot detach a linked bill from every project', async (): Promise<void> => {
    const { actor, record, repository, service } = setup(projectId, false);
    await expect(
      service.update(
        { id: record.id, actor },
        { version: record.version, projectId: null },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(repository.update.mock.calls).toHaveLength(0);
  });

  it('can assign an unlinked legacy bill to its confirmed project', async (): Promise<void> => {
    const { actor, record, repository, service } = setup(null, false);
    await service.update(
      { id: record.id, actor },
      { version: record.version, projectId },
    );
    expect(repository.update.mock.calls[0]?.[0].projectId).toBe(projectId);
  });

  it.each(scenarios)(
    '$name',
    async ({ body, copiedPlans, target }): Promise<void> => {
      const { actor, record, repository, service } = setup(
        projectId,
        copiedPlans,
      );
      const transformed: unknown = await pipe.transform(
        { version: record.version, ...body },
        {
          type: 'body',
          metatype: UpdateEngineeringEstimateDto,
        },
      );
      if (!(transformed instanceof UpdateEngineeringEstimateDto)) {
        throw new Error('Expected a real transformed Nest request DTO');
      }

      await service.update({ id: record.id, actor }, transformed);
      expect(repository.update.mock.calls[0]?.[0].projectId).toBe(target);
      expect(repository.hasCopiedPlans.mock.calls).toHaveLength(
        target === projectId ? 0 : 1,
      );
    },
  );
});

describe('Estimate draft calculation and creation', (): void => {
  const area = {
    id: randomUUID(),
    name: 'דירה',
    repeatCount: 3,
    lines: [{ id: randomUUID(), catalogueItemId: randomUUID(), quantity: '2' }],
  };

  it('returns calculated quantities and prices without writing an estimate', async (): Promise<void> => {
    const { service, repository, pricing, transaction } = setup(
      randomUUID(),
      false,
    );
    const lines = [
      {
        sku: 'AC',
        unit: 'יחידה',
        areaId: area.id,
        areaName: area.name,
        quantity: '6',
        description: 'מזגן',
        total: '600.00',
        unitPrice: '100.00',
        provenance: null,
        catalogueItemId: area.lines[0].catalogueItemId,
        source: 'manual' as const,
      },
    ];
    pricing.calculate.mockResolvedValue(lines);
    await expect(
      service.preview({ scope: ESTIMATE_SCOPE.HVAC, areas: [area] }),
    ).resolves.toEqual({ lines, subtotal: '600.00' });
    expect(pricing.calculate.mock.calls).toContainEqual([
      [area],
      ESTIMATE_SCOPE.HVAC,
      transaction,
    ]);
    expect(repository.insert.mock.calls).toHaveLength(0);
    expect(repository.update.mock.calls).toHaveLength(0);
  });

  it('stores the populated first draft as version one in the pricing transaction', async (): Promise<void> => {
    const { actor, service, repository, pricing, transaction } = setup(
      randomUUID(),
      false,
    );
    const created = await service.create(
      { name: ' כתב כמויות ', scope: ESTIMATE_SCOPE.HVAC, areas: [area] },
      actor,
    );
    expect(repository.insert.mock.calls[0]).toEqual([
      expect.objectContaining({
        name: 'כתב כמויות',
        version: 1,
        areas: [area],
        scope: ESTIMATE_SCOPE.HVAC,
      }),
      transaction,
    ]);
    expect(pricing.calculate.mock.invocationCallOrder[0]).toBeLessThan(
      repository.insert.mock.invocationCallOrder[0],
    );
    expect(created.areas).toEqual([area]);
    expect(repository.update.mock.calls).toHaveLength(0);
  });

  it('preserves name-only creation', async (): Promise<void> => {
    const { actor, service, repository, transaction } = setup(
      randomUUID(),
      false,
    );
    await service.create({ name: 'טיוטה' }, actor);
    expect(repository.insert.mock.calls[0]).toEqual([
      expect.objectContaining({
        version: 1,
        areas: [],
        scope: ESTIMATE_SCOPE.HVAC,
      }),
      transaction,
    ]);
  });

  it('does not insert when calculation fails', async (): Promise<void> => {
    const { actor, service, repository, pricing } = setup(randomUUID(), false);
    pricing.calculate.mockRejectedValue(new Error('Catalogue unavailable'));
    await expect(
      service.create({ name: 'טיוטה', areas: [area] }, actor),
    ).rejects.toThrow('Catalogue unavailable');
    expect(repository.insert.mock.calls).toHaveLength(0);
  });

  it('rejects duplicate row identities in both preview and create', async (): Promise<void> => {
    const { actor, service, repository, pricing } = setup(randomUUID(), false);
    const areas = [area, { ...area, id: randomUUID() }];
    await expect(
      service.preview({ scope: ESTIMATE_SCOPE.HVAC, areas }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.create({ name: 'טיוטה', areas }, actor),
    ).rejects.toMatchObject({ status: 400 });
    expect(pricing.calculate.mock.calls).toHaveLength(0);
    expect(repository.insert.mock.calls).toHaveLength(0);
  });
});

describe('Engineering estimate listing amounts', (): void => {
  const row = (overrides: Partial<IEstimateListRow>): IEstimateListRow => ({
    id: randomUUID(),
    name: 'טיוטה',
    updatedAt: new Date(),
    status: 'draft',
    projectId: null,
    areas: [],
    scope: ESTIMATE_SCOPE.HVAC,
    createdByName: 'כפיר מור',
    snapshotSubtotal: null,
    ...overrides,
  });

  it('uses the saved snapshot amount and prices drafts live', async (): Promise<void> => {
    const { actor, repository, pricing, service } = setup(null, false);
    repository.list.mockResolvedValue({
      nextCursor: null,
      items: [
        row({ status: 'approved', snapshotSubtotal: '387900.00' }),
        row({}),
      ],
    });
    pricing.calculate.mockResolvedValue([
      { total: '100.00' },
      { total: '25.50' },
    ] as never);

    const page = await service.list(actor, {});

    expect(page.items.map((item) => item.subtotal)).toEqual([
      '387900.00',
      '125.50',
    ]);
    expect(page.items[0]).toMatchObject({ createdByName: 'כפיר מור' });
    expect(pricing.calculate.mock.calls).toHaveLength(1);
  });

  it('keeps the list available when a draft cannot be priced', async (): Promise<void> => {
    const { actor, repository, pricing, service } = setup(null, false);
    repository.list.mockResolvedValue({ nextCursor: null, items: [row({})] });
    pricing.calculate.mockRejectedValue(new Error('Catalogue unavailable'));

    const page = await service.list(actor, {});

    expect(page.items[0].subtotal).toBeNull();
  });
});
