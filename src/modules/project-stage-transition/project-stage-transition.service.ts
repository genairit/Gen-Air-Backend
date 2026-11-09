import {
  IStageChange,
  ILatestNoteQuery,
  TNoteByProjectId,
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

  async findLatestNotesByTargetStages(
    query: ILatestNoteQuery,
  ): Promise<TNoteByProjectId> {
    if (query.projectIds.length === 0) {
      return new Map();
    }

    const notes =
      await this.projectStageTransitionRepository.findNotesByTargetStages(
        query,
      );

    // Notes arrive oldest first, so each project's newest note overwrites its older ones.
    return new Map(notes.map(({ projectId, note }) => [projectId, note]));
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
