import {
  ILatestNoteQuery,
  TProjectStageTransitionNote,
  TProjectStageTransitionCreationAttributes,
} from './interfaces/project-stage-transition.interface';

import { Op, Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { User } from '@Modules/user/entities/user.entity';
import { ProjectStage } from '@Modules/project-stage/entities/project-stage.entity';
import { ProjectStageTransition } from './entities/project-stage-transition.entity';

@Injectable()
export class ProjectStageTransitionRepository {
  findByProject(projectId: string): Promise<ProjectStageTransition[]> {
    return ProjectStageTransition.findAll({
      where: { projectId },
      include: [
        { model: ProjectStage, as: 'fromStage', paranoid: false },
        { model: ProjectStage, as: 'toStage', paranoid: false },
        { model: User, as: 'changedBy', paranoid: false },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  findNotesInto({
    toStageId,
    projectIds,
  }: ILatestNoteQuery): Promise<TProjectStageTransitionNote[]> {
    return ProjectStageTransition.findAll({
      attributes: ['projectId', 'note'],
      where: { toStageId, projectId: { [Op.in]: projectIds } },
      order: [['createdAt', 'ASC']],
      raw: true,
    });
  }

  create(
    attributes: TProjectStageTransitionCreationAttributes,
    transaction?: Transaction,
  ): Promise<ProjectStageTransition> {
    return ProjectStageTransition.create(attributes, { transaction });
  }
}
