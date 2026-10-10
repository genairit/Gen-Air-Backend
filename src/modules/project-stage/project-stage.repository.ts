import {
  TProjectStageUpdateAttributes,
  TProjectStageCreationAttributes,
} from './interfaces/project-stage.interface';

import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { ProjectStage } from './entities/project-stage.entity';

@Injectable()
export class ProjectStageRepository {
  findAll(): Promise<ProjectStage[]> {
    return ProjectStage.findAll({ order: [['position', 'ASC']] });
  }

  findById(id: string): Promise<ProjectStage | null> {
    return ProjectStage.findByPk(id);
  }

  findFirst(): Promise<ProjectStage | null> {
    return ProjectStage.findOne({ order: [['position', 'ASC']] });
  }

  async findMaxPosition(): Promise<number> {
    const maxPosition = await ProjectStage.max<number | null, ProjectStage>(
      'position',
    );

    return maxPosition ?? 0;
  }

  count(): Promise<number> {
    return ProjectStage.count();
  }

  create(
    attributes: TProjectStageCreationAttributes,
    transaction?: Transaction,
  ): Promise<ProjectStage> {
    return ProjectStage.create(attributes, { transaction });
  }

  async update(
    id: string,
    attributes: TProjectStageUpdateAttributes,
    transaction?: Transaction,
  ): Promise<boolean> {
    const [updatedCount] = await ProjectStage.update(attributes, {
      where: { id },
      transaction,
    });

    return updatedCount > 0;
  }

  async reorder(stageIds: string[], transaction: Transaction): Promise<void> {
    // Two passes because the unique position index rejects an in-place swap.
    await this.updatePositions(stageIds, (index) => -(index + 1), transaction);
    await this.updatePositions(stageIds, (index) => index + 1, transaction);
  }

  async softDelete(id: string, transaction?: Transaction): Promise<boolean> {
    const deletedCount = await ProjectStage.destroy({
      where: { id },
      transaction,
    });

    return deletedCount > 0;
  }

  private async updatePositions(
    stageIds: string[],
    toPosition: (index: number) => number,
    transaction: Transaction,
  ): Promise<void> {
    for (const [index, id] of stageIds.entries()) {
      await ProjectStage.update(
        { position: toPosition(index) },
        { where: { id }, transaction },
      );
    }
  }
}
