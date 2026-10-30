import {
  CUSTOMER_PROJECT_ATTRIBUTES,
  CUSTOMER_PROJECT_USER_ATTRIBUTES,
} from './constants/customer-project.constant';

import {
  ICustomerProjectBatch,
  ICustomerProjectScope,
  ICustomerProjectSource,
} from './interfaces/customer-project.interface';

import { Project } from './entities/project.entity';
import { User } from '@Modules/user/entities/user.entity';
import { toContainsPattern } from '@Utilities/query.utility';
import { IProjectStageCount } from './interfaces/project.interface';
import { Op, Sequelize, Includeable, WhereOptions } from 'sequelize';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ProjectType } from '@Modules/project-type/entities/project-type.entity';
import { ProjectStage } from '@Modules/project-stage/entities/project-stage.entity';
import { ProjectMember } from '@Modules/project-member/entities/project-member.entity';
import { buildCustomerProjectCursorWhere } from './utilities/customer-project-cursor.utility';

@Injectable()
export class CustomerProjectRepository {
  async findPage(
    scope: ICustomerProjectScope,
    batch: ICustomerProjectBatch,
  ): Promise<ICustomerProjectSource[]> {
    const rows = await Project.findAll({
      where: {
        [Op.and]: [
          ...this.buildWhere(scope),
          ...buildCustomerProjectCursorWhere(batch.cursor),
          ...(scope.stageId ? [{ stageId: scope.stageId }] : []),
        ],
      },
      attributes: [
        ...CUSTOMER_PROJECT_ATTRIBUTES,
        [
          Sequelize.literal(
            '(SELECT COUNT(*)::int FROM projects AS apartments WHERE apartments.parent_project_id = "Project"."id" AND apartments.deleted_at IS NULL)',
          ),
          'apartmentCount',
        ],
      ],
      include: [
        { model: ProjectType },
        { model: ProjectStage, paranoid: false },
        this.memberInclude(),
        {
          model: Project,
          as: 'parentProject',
          required: false,
          attributes: ['id', 'name', 'code', 'customerId'],
          include: [this.memberInclude()],
        },
      ],
      order: [
        ['updatedAt', 'DESC'],
        ['name', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: batch.size + 1,
    });

    return rows.map((row) => {
      const apartmentCount = row.get('apartmentCount');
      if (typeof apartmentCount !== 'number') {
        throw new InternalServerErrorException('Invalid related project count');
      }

      return { ...row.get({ plain: true }), apartmentCount };
    });
  }

  async countByStage(
    scope: ICustomerProjectScope,
  ): Promise<IProjectStageCount[]> {
    const rows = await Project.count({
      where: { [Op.and]: this.buildWhere(scope) },
      include: [this.parentInclude()],
      group: ['stageId'],
    });

    return rows.flatMap(({ stageId, count }) =>
      typeof stageId === 'string' ? [{ stageId, count: Number(count) }] : [],
    );
  }

  countAll(scope: ICustomerProjectScope): Promise<number> {
    return Project.count({
      where: { [Op.and]: this.buildWhere({ ...scope, search: '' }) },
      include: [this.parentInclude()],
    });
  }

  private parentInclude(): Includeable {
    return {
      model: Project,
      as: 'parentProject',
      attributes: [],
      required: false,
    };
  }

  private memberInclude(): Includeable {
    return {
      model: ProjectMember,
      separate: true,
      include: [
        {
          model: User,
          paranoid: false,
          attributes: CUSTOMER_PROJECT_USER_ATTRIBUTES,
        },
      ],
    };
  }

  private buildWhere(scope: ICustomerProjectScope): WhereOptions<Project>[] {
    const search = toContainsPattern(scope.search);
    return [
      { customerId: scope.customerId },
      {
        [Op.or]: [
          { parentProjectId: null },
          {
            [Op.and]: [
              { '$parentProject.id$': { [Op.ne]: null } },
              {
                [Op.or]: [
                  { '$parentProject.customer_id$': null },
                  {
                    '$parentProject.customer_id$': {
                      [Op.ne]: scope.customerId,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      ...(scope.search
        ? [
            {
              [Op.or]: [
                { name: { [Op.iLike]: search } },
                { code: { [Op.iLike]: search } },
                { '$parentProject.name$': { [Op.iLike]: search } },
                { '$parentProject.code$': { [Op.iLike]: search } },
              ],
            },
          ]
        : []),
    ];
  }
}
