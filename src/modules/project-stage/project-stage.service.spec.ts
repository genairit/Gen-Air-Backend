import { Test } from '@nestjs/testing';
import { ProjectStageService } from './project-stage.service';
import { ProjectService } from '@Modules/project/project.service';
import { ProjectStageRepository } from './project-stage.repository';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { DatabaseTransactionService } from '@Providers/database/database-transaction.service';

const STAGES = [
  { id: 'stage-1', position: 1 },
  { id: 'stage-2', position: 2 },
];

const createService = async () => {
  const projectStageRepository = {
    reorder: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue(STAGES),
    count: jest.fn().mockResolvedValue(STAGES.length),
    softDelete: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockResolvedValue(STAGES[0]),
  };
  const projectService = { countByStage: jest.fn().mockResolvedValue(0) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ProjectStageService,
      { provide: ProjectService, useValue: projectService },
      { provide: ProjectStageRepository, useValue: projectStageRepository },
      {
        provide: DatabaseTransactionService,
        useValue: {
          run: jest.fn((work: (transaction: object) => unknown) => work({})),
        },
      },
    ],
  }).compile();

  return {
    service: moduleRef.get(ProjectStageService),
    projectService,
    projectStageRepository,
  };
};

describe('ProjectStageService.delete', () => {
  it('soft deletes an empty stage', async () => {
    const { service, projectStageRepository } = await createService();

    await service.delete('stage-1');

    expect(projectStageRepository.softDelete).toHaveBeenCalledWith('stage-1');
  });

  it('refuses to delete a stage that still holds projects', async () => {
    const { service, projectService, projectStageRepository } =
      await createService();
    projectService.countByStage.mockResolvedValue(3);

    await expect(service.delete('stage-1')).rejects.toThrow(ConflictException);
    expect(projectStageRepository.softDelete).not.toHaveBeenCalled();
  });

  it('refuses to delete the last remaining stage', async () => {
    const { service, projectStageRepository } = await createService();
    projectStageRepository.count.mockResolvedValue(1);

    await expect(service.delete('stage-1')).rejects.toThrow(ConflictException);
  });
});

describe('ProjectStageService.reorder', () => {
  it('reorders when every stage is listed once', async () => {
    const { service, projectStageRepository } = await createService();

    await service.reorder({ stageIds: ['stage-2', 'stage-1'] });

    expect(projectStageRepository.reorder).toHaveBeenCalledWith(
      ['stage-2', 'stage-1'],
      {},
    );
  });

  it.each([
    ['a missing stage', ['stage-1']],
    ['an unknown stage', ['stage-1', 'stage-9']],
  ])('rejects an order with %s', async (_label, stageIds) => {
    const { service } = await createService();

    await expect(service.reorder({ stageIds })).rejects.toThrow(
      BadRequestException,
    );
  });
});
