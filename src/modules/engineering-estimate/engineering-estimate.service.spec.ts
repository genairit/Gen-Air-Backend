import {
  ESTIMATE_SCOPE,
  ESTIMATE_SETUP_STEP,
} from './constants/engineering-estimate.constant';

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
import type { IEstimateRecord } from './interfaces/engineering-estimate.interface';
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
  return { actor, record, repository, service };
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
