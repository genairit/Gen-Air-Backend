import {
  IProjectFilter,
  IProjectStageCount,
  TProjectUpdateAttributes,
  TProjectCreationAttributes,
} from './interfaces/project.interface';

import {
  CURSOR_ORDER,
  toCursorPage,
  buildCursorWhere,
} from '@Utilities/cursor-pagination.utility';

import { Injectable } from '@nestjs/common';
import { Project } from './entities/project.entity';
import { User } from '@Modules/user/entities/user.entity';
import { Op, Includeable, Transaction, WhereOptions } from 'sequelize';
import { ICursorPage, ICursorBatch } from '@Interfaces/cursor-page.interface';
import { toContainsPattern, whereWhenPresent } from '@Utilities/query.utility';
import { ProjectType } from '@Modules/project-type/entities/project-type.entity';
import { ProjectStage } from '@Modules/project-stage/entities/project-stage.entity';
import { ProjectMember } from '@Modules/project-member/entities/project-member.entity';

@Injectable()
export class ProjectRepository {
  findById(id: string): Promise<Project | null> {
    return Project.findByPk(id, {
      include: [
        ...this.buildCardIncludes(),
        { model: User, as: 'createdBy', paranoid: false },
      ],
    });
  }

  async findByFilter(
    filter: IProjectFilter,
    batch: ICursorBatch,
  ): Promise<ICursorPage<Project>> {
    const rows = await Project.findAll({
      where: {
        [Op.and]: [
          ...this.buildFilterWhere(filter),
          ...buildCursorWhere(batch.batchCursor),
        ],
      },
      include: this.buildCardIncludes(),
      order: CURSOR_ORDER,
      limit: batch.batchSize + 1,
    });

    return toCursorPage(rows, batch.batchSize);
  }

  async isCodeTaken(code: string): Promise<boolean> {
    const matchingCount = await Project.count({
      where: { code },
      paranoid: false,
    });

    return matchingCount > 0;
  }

  async countGroupedByStage(
    filter: IProjectFilter,
  ): Promise<IProjectStageCount[]> {
    const groupedCounts = await Project.count({
      where: { [Op.and]: this.buildFilterWhere(filter) },
      group: ['stageId'],
    });

    return groupedCounts.flatMap(({ stageId, count }) =>
      typeof stageId === 'string' ? [{ stageId, count }] : [],
    );
  }

  countByStage(stageId: string): Promise<number> {
    return Project.count({ where: { stageId } });
  }

  create(
    attributes: TProjectCreationAttributes,
    transaction?: Transaction,
  ): Promise<Project> {
    return Project.create(attributes, { transaction });
  }

  async update(
    id: string,
    attributes: TProjectUpdateAttributes,
    transaction?: Transaction,
  ): Promise<boolean> {
    const [updatedCount] = await Project.update(attributes, {
      where: { id },
      transaction,
    });

    return updatedCount > 0;
  }

  async updateDriveFolderId(
    id: string,
    driveFolderId: string,
    transaction?: Transaction,
  ): Promise<boolean> {
    const [updatedCount] = await Project.update(
      { driveFolderId },
      { where: { id }, transaction },
    );

    return updatedCount > 0;
  }

  async softDelete(id: string, transaction?: Transaction): Promise<boolean> {
    const deletedCount = await Project.destroy({ where: { id }, transaction });

    return deletedCount > 0;
  }

  private buildCardIncludes(): Includeable[] {
    return [
      { model: ProjectType },
      { model: ProjectStage, paranoid: false },
      {
        model: ProjectMember,
        separate: true,
        include: [{ model: User, paranoid: false }],
      },
    ];
  }

  private buildFilterWhere(filter: IProjectFilter): WhereOptions<Project>[] {
    return [
      ...whereWhenPresent(filter.stageId, (stageId) => ({ stageId })),
      ...whereWhenPresent(filter.projectTypeId, (projectTypeId) => ({
        projectTypeId,
      })),
      ...whereWhenPresent(filter.projectIds, (projectIds) => ({
        id: { [Op.in]: projectIds },
      })),
      ...whereWhenPresent(filter.search, (search) =>
        this.buildSearchWhere(search),
      ),
    ];
  }

  private buildSearchWhere(search: string): WhereOptions<Project> {
    const pattern = toContainsPattern(search);

    return {
      [Op.or]: [
        { name: { [Op.iLike]: pattern } },
        { code: { [Op.iLike]: pattern } },
      ],
    };
  }
}
