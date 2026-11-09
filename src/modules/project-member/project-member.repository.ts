import { Op, Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { User } from '@Modules/user/entities/user.entity';
import { USER_ROLES } from '@Constants/user-role.constant';
import { UserRoleType } from '@Constants/user-role.constant';
import { ProjectMember } from './entities/project-member.entity';
import { IProjectMemberAssignment } from './interfaces/project-member.interface';

@Injectable()
export class ProjectMemberRepository {
  findByProject(projectId: string): Promise<ProjectMember[]> {
    return ProjectMember.findAll({
      where: { projectId },
      include: [{ model: User, paranoid: false }],
      order: [['role', 'ASC']],
    });
  }

  async findProjectIdsByMember(
    userId: string,
    role: UserRoleType,
  ): Promise<string[]> {
    const memberships = await ProjectMember.findAll({
      where: { userId, role },
      attributes: ['projectId'],
    });

    return memberships.map((membership) => membership.projectId);
  }

  async replaceForProject(
    projectId: string,
    assignments: IProjectMemberAssignment[],
    transaction?: Transaction,
  ): Promise<void> {
    await ProjectMember.destroy({ where: { projectId }, transaction });
    await ProjectMember.bulkCreate(
      assignments.map((assignment) => ({ ...assignment, projectId })),
      { transaction },
    );
  }

  async replaceApartmentTeam(
    projectId: string,
    assignments: IProjectMemberAssignment[],
    transaction: Transaction,
  ): Promise<void> {
    await ProjectMember.destroy({
      where: { projectId, role: { [Op.ne]: USER_ROLES.ENGINEER } },
      transaction,
    });
    await ProjectMember.bulkCreate(
      assignments
        .filter((assignment) => assignment.role !== USER_ROLES.ENGINEER)
        .map((assignment) => ({ ...assignment, projectId })),
      { transaction },
    );
  }

  async setApartmentEngineer(
    projectId: string,
    userId: string | null,
    transaction: Transaction,
  ): Promise<void> {
    const where = { projectId, role: USER_ROLES.ENGINEER };
    const existing = await ProjectMember.findOne({ where, transaction });

    if (existing?.userId === userId) {
      return;
    }

    await ProjectMember.destroy({ where, transaction });

    if (userId) {
      await ProjectMember.create({ ...where, userId }, { transaction });
    }
  }
}
