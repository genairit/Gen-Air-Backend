import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { User } from '@Modules/user/entities/user.entity';
import { ProjectStage } from '@Modules/project-stage/entities/project-stage.entity';
import { ProjectStageTransition } from './entities/project-stage-transition.entity';
import { TProjectStageTransitionCreationAttributes } from './interfaces/project-stage-transition.interface';

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

  create(
    attributes: TProjectStageTransitionCreationAttributes,
    transaction?: Transaction,
  ): Promise<ProjectStageTransition> {
    return ProjectStageTransition.create(attributes, { transaction });
  }
}
