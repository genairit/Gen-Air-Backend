import {
  IStageChange,
  IProjectStageTransition,
} from './interfaces/project-stage-transition.interface';

import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { ProjectStageTransitionRepository } from './project-stage-transition.repository';

@Injectable()
export class ProjectStageTransitionService {
  constructor(
    private readonly projectStageTransitionRepository: ProjectStageTransitionRepository,
  ) {}

  getByProject(projectId: string): Promise<IProjectStageTransition[]> {
    return this.projectStageTransitionRepository.findByProject(projectId);
  }

  async record(change: IStageChange, transaction?: Transaction): Promise<void> {
    await this.projectStageTransitionRepository.create(
      {
        note: change.note,
        projectId: change.projectId,
        toStageId: change.toStageId,
        fromStageId: change.fromStageId,
        changedById: change.changedBy.id,
        changedByRole: change.changedBy.role,
      },
      transaction,
    );
  }
}
