import {
  IProjectMember,
  IProjectMemberAssignment,
} from './interfaces/project-member.interface';

import { Transaction } from 'sequelize';
import { UserService } from '@Modules/user/user.service';
import { UserRoleType } from '@Constants/user-role.constant';
import { Injectable, BadRequestException } from '@nestjs/common';
import { ProjectMemberRepository } from './project-member.repository';

@Injectable()
export class ProjectMemberService {
  constructor(
    private readonly projectMemberRepository: ProjectMemberRepository,
    private readonly userService: UserService,
  ) {}

  getByProject(projectId: string): Promise<IProjectMember[]> {
    return this.projectMemberRepository.findByProject(projectId);
  }

  findProjectIdsByMember(
    userId: string,
    role: UserRoleType,
  ): Promise<string[]> {
    return this.projectMemberRepository.findProjectIdsByMember(userId, role);
  }

  async validateAssignments(
    assignments: IProjectMemberAssignment[],
  ): Promise<void> {
    const roles = assignments.map((assignment) => assignment.role);
    const hasDuplicateRole = new Set(roles).size !== roles.length;

    if (hasDuplicateRole) {
      throw new BadRequestException(
        'Each role can be assigned to only one employee per project',
      );
    }

    const users = await this.userService.findByIds(
      assignments.map((assignment) => assignment.userId),
    );
    const roleByUserId = new Map(users.map((user) => [user.id, user.role]));
    const mismatchedAssignments = assignments.filter(
      (assignment) => roleByUserId.get(assignment.userId) !== assignment.role,
    );

    if (mismatchedAssignments.length > 0) {
      throw new BadRequestException({
        message: 'Each assigned employee must exist and hold the assigned role',
        safeResponse: { mismatchedAssignments },
      });
    }
  }

  replaceForProject(
    projectId: string,
    assignments: IProjectMemberAssignment[],
    transaction?: Transaction,
  ): Promise<void> {
    return this.projectMemberRepository.replaceForProject(
      projectId,
      assignments,
      transaction,
    );
  }
}
