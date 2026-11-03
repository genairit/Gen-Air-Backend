import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { UserRoleRepository } from './user-role.repository';
import { UserRoleType } from '@Constants/user-role.constant';

@Injectable()
export class UserRoleService {
  constructor(private readonly repository: UserRoleRepository) {}

  async getAssignedRolesByUserIds(
    userIds: string[],
    transaction?: Transaction,
  ): Promise<Map<string, UserRoleType[]>> {
    const assignments = await this.repository.findByUserIds(
      userIds,
      transaction,
    );
    const rolesByUserId = new Map<string, UserRoleType[]>();

    assignments.forEach(({ userId, role }) => {
      const currentRoles = rolesByUserId.get(userId) ?? [];
      rolesByUserId.set(userId, [...currentRoles, role]);
    });

    return rolesByUserId;
  }

  findUserIdsByRole(
    role: UserRoleType,
    transaction?: Transaction,
  ): Promise<string[]> {
    return this.repository.findUserIdsByRole(role, transaction);
  }

  replaceForUser(
    userId: string,
    roles: UserRoleType[],
    transaction: Transaction,
  ): Promise<void> {
    return this.repository.replaceForUser(userId, roles, transaction);
  }

  async create(
    assignments: Array<{ userId: string; role: UserRoleType }>,
    transaction: Transaction,
  ): Promise<void> {
    await this.repository.create(assignments, transaction);
  }
}
