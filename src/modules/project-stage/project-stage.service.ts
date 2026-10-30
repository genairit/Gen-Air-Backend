import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  PROJECT_STATUS_IDS,
  FIXED_PROJECT_STATUSES,
  PROJECT_STATUS_MIGRATION_MESSAGE,
} from '@Constants/project-status.constant';

import { ProjectStageRepository } from './project-stage.repository';
import { IProjectStage } from './interfaces/project-stage.interface';

@Injectable()
export class ProjectStageService {
  constructor(
    private readonly projectStageRepository: ProjectStageRepository,
  ) {}

  async getAll(): Promise<IProjectStage[]> {
    const stages = await this.projectStageRepository.findAll();
    const matchesCatalog =
      stages.length === FIXED_PROJECT_STATUSES.length &&
      FIXED_PROJECT_STATUSES.every((definition, index) => {
        const stage = stages[index];
        return (
          stage.id === definition.id &&
          stage.name === definition.name &&
          stage.position === definition.position
        );
      });
    if (!matchesCatalog) {
      throw new ServiceUnavailableException(PROJECT_STATUS_MIGRATION_MESSAGE);
    }
    return stages;
  }

  async getById(id: string): Promise<IProjectStage> {
    const definition = FIXED_PROJECT_STATUSES.find(
      (status) => status.id === id.toLowerCase(),
    );
    if (!definition) {
      throw new NotFoundException(`Project status ${id} was not found`);
    }
    const stage = await this.projectStageRepository.findById(id);
    if (
      !stage ||
      stage.name !== definition.name ||
      stage.position !== definition.position
    ) {
      throw new ServiceUnavailableException(PROJECT_STATUS_MIGRATION_MESSAGE);
    }
    return stage;
  }

  getInitialStage(): Promise<IProjectStage> {
    return this.getById(PROJECT_STATUS_IDS.DRAFT);
  }
}
