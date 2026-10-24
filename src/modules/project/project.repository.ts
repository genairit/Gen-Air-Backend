import {
  Op,
  Sequelize,
  Includeable,
  Transaction,
  WhereOptions,
} from 'sequelize';

import {
  IProject,
  IProjectFilter,
  IProjectStageCount,
  TProjectUpdateAttributes,
  TProjectCreationAttributes,
} from './interfaces/project.interface';

import {
  toCursorPage,
  buildCursorWhere,
  CURSOR_ORDER_BY_DIRECTION,
} from '@Utilities/cursor-pagination.utility';

import { Injectable } from '@nestjs/common';
import { Literal } from 'sequelize/types/utils';
import { Project } from './entities/project.entity';
import { User } from '@Modules/user/entities/user.entity';
import { CURSOR_DIRECTIONS } from '@Constants/pagination.constant';
import { Customer } from '@Modules/customer/entities/customer.entity';
import { ICursorPage, ICursorBatch } from '@Interfaces/cursor-page.interface';
import { CUSTOMER_SEARCH_INCLUDE } from './constants/project-include.constant';
import { toContainsPattern, whereWhenPresent } from '@Utilities/query.utility';
import { ProjectType } from '@Modules/project-type/entities/project-type.entity';
import { ProjectStage } from '@Modules/project-stage/entities/project-stage.entity';
import { ProjectMember } from '@Modules/project-member/entities/project-member.entity';
import { BUILDING_INHERITANCE_ATTRIBUTES } from './constants/project-inheritance.constant';
import { buildCustomerReferenceInclude } from '@Modules/customer/constants/customer-reference.constant';

@Injectable()
export class ProjectRepository {
  async findById(id: string): Promise<IProject | null> {
    const project = await Project.findByPk(id, {
      include: [
        ...this.buildCardIncludes(),
        { model: Customer, paranoid: false },
        { model: User, as: 'createdBy', paranoid: false },
        {
          model: Project,
          as: 'parentProject',
          attributes: BUILDING_INHERITANCE_ATTRIBUTES,
          include: [buildCustomerReferenceInclude()],
        },
      ],
    });

    return project?.get({ plain: true }) ?? null;
  }

  findLiveApartmentByNumber(
    buildingId: string,
    apartmentNumber: string,
  ): Promise<Project | null> {
    return Project.findOne({
      where: {
        parentProjectId: buildingId,
        customerApartment: apartmentNumber,
      },
    });
  }

  countLiveApartments(buildingId: string): Promise<number> {
    return Project.count({ where: { parentProjectId: buildingId } });
  }

  countApartmentsEverCreated(buildingId: string): Promise<number> {
    return Project.count({
      where: { parentProjectId: buildingId },
      paranoid: false,
    });
  }

  async findByFilter(
    filter: IProjectFilter,
    batch: ICursorBatch,
  ): Promise<ICursorPage<IProject>> {
    const direction = batch.direction ?? CURSOR_DIRECTIONS.NEWEST_FIRST;
    const rows = await Project.findAll({
      where: {
        [Op.and]: [
          ...this.buildFilterWhere(filter),
          ...buildCursorWhere(batch.batchCursor, direction),
        ],
      },
      include: [...this.buildCardIncludes(), CUSTOMER_SEARCH_INCLUDE],
      attributes: { include: [this.buildApartmentCountAttribute()] },
      order: CURSOR_ORDER_BY_DIRECTION[direction],
      limit: batch.batchSize + 1,
    });

    return toCursorPage(
      rows.map((row) => row.get({ plain: true })),
      batch.batchSize,
    );
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
      include: [CUSTOMER_SEARCH_INCLUDE],
      where: { [Op.and]: this.buildFilterWhere(filter) },
      group: ['stageId'],
    });

    return groupedCounts.flatMap(({ stageId, count }) =>
      typeof stageId === 'string' ? [{ stageId, count }] : [],
    );
  }

  countByFilter(filter: IProjectFilter): Promise<number> {
    return Project.count({
      include: [CUSTOMER_SEARCH_INCLUDE],
      where: { [Op.and]: this.buildFilterWhere(filter) },
    });
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

  private buildApartmentCountAttribute(): [Literal, string] {
    return [
      Sequelize.literal(
        '(SELECT COUNT(*)::int FROM projects AS apartments WHERE apartments.parent_project_id = "Project"."id" AND apartments.deleted_at IS NULL)',
      ),
      'apartmentCount',
    ];
  }

  private buildFilterWhere(filter: IProjectFilter): WhereOptions<Project>[] {
    return [
      { parentProjectId: filter.parentProjectId },
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
        { customerName: { [Op.iLike]: pattern } },
        { '$customer.name$': { [Op.iLike]: pattern } },
        { customerApartment: { [Op.iLike]: pattern } },
      ],
    };
  }
}
