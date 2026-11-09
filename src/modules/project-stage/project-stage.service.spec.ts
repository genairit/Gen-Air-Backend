import {
  PROJECT_STATUS_IDS,
  FIXED_PROJECT_STATUSES,
} from '@Constants/project-status.constant';

import { Test } from '@nestjs/testing';
import { ProjectStageService } from './project-stage.service';
import { ProjectStageRepository } from './project-stage.repository';
import { IProjectStage } from './interfaces/project-stage.interface';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

const STAGES: IProjectStage[] = FIXED_PROJECT_STATUSES.map((stage) => ({
  ...stage,
  tag: null,
  color: null,
  description: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}));
const createService = async () => {
  const repository = {
    findAll: jest.fn().mockResolvedValue(STAGES),
    findById: jest.fn((id: string) =>
      Promise.resolve(
        STAGES.find((stage) => stage.id.toLowerCase() === id.toLowerCase()) ??
          null,
      ),
    ),
  };
  const module = await Test.createTestingModule({
    providers: [
      ProjectStageService,
      { provide: ProjectStageRepository, useValue: repository },
    ],
  }).compile();
  return { service: module.get(ProjectStageService), repository };
};
describe('Fixed project status catalog', () => {
  it('reads the four engineering statuses in their fixed order', async () => {
    const { service } = await createService();
    expect((await service.getAll()).map((stage) => stage.name)).toEqual([
      'טרם בעבודה',
      'בעבודה',
      'מחכה לתשובה',
      'הושלם',
    ]);
  });
  it.each([
    STAGES.slice(0, 3),
    [...STAGES, { ...STAGES[0], id: 'custom' }],
    [...STAGES].reverse(),
    STAGES.map((stage) => ({ ...stage, name: 'changed' })),
  ])('fails closed for an incomplete or modified catalog', async (stages) => {
    const { service, repository } = await createService();
    repository.findAll.mockResolvedValue(stages);
    await expect(service.getAll()).rejects.toThrow(ServiceUnavailableException);
  });
  it('defaults new projects to Not Started by its stable database ID', async () => {
    const { service, repository } = await createService();
    expect((await service.getInitialStage()).id).toBe(
      PROJECT_STATUS_IDS.NOT_STARTED,
    );
    expect(repository.findById).toHaveBeenCalledWith(
      PROJECT_STATUS_IDS.NOT_STARTED,
    );
  });
  it('accepts canonical UUIDs regardless of letter case', async () => {
    const { service } = await createService();
    expect(
      (await service.getById(PROJECT_STATUS_IDS.NOT_STARTED.toUpperCase())).id,
    ).toBe(PROJECT_STATUS_IDS.NOT_STARTED);
  });
  it('rejects retired/custom status targets without reading them', async () => {
    const { service, repository } = await createService();
    await expect(
      service.getById('6502a045-2a7d-4bc8-8ba1-36eaedc49a00'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.getById('6502a045-2a7d-4bc8-8ba1-36eaedc49a01'),
    ).rejects.toThrow(NotFoundException);
    await expect(service.getById('old-sales-stage')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.findById).not.toHaveBeenCalled();
  });
  it('requires the migration when a canonical status is missing or changed', async () => {
    const { service, repository } = await createService();
    repository.findById.mockResolvedValue(null);
    await expect(
      service.getById(PROJECT_STATUS_IDS.NOT_STARTED),
    ).rejects.toThrow(ServiceUnavailableException);
    repository.findById.mockResolvedValue({ ...STAGES[0], name: 'edited' });
    await expect(
      service.getById(PROJECT_STATUS_IDS.NOT_STARTED),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
