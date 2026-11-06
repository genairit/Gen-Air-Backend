import { Injectable } from '@nestjs/common';
import { Op, Transaction } from 'sequelize';
import { UserRole } from './entities/user-role.entity';
import { UserRoleType } from '@Constants/user-role.constant';
import { TUserRoleCreationAttributes } from './interfaces/user-role.interface';

@Injectable()
export class UserRoleRepository {
  findByUserIds(
    userIds: string[],
    transaction?: Transaction,
  ): Promise<UserRole[]> {
    return UserRole.findAll({
      where: { userId: { [Op.in]: userIds } },
      transaction,
    });
  }

  async findUserIdsByRole(
    role: UserRoleType,
    transaction?: Transaction,
  ): Promise<string[]> {
    const assignments = await UserRole.findAll({
      attributes: ['userId'],
      where: { role },
      transaction,
    });

    return assignments.map(({ userId }) => userId);
  }

  async replaceForUser(
    userId: string,
    roles: UserRoleType[],
    transaction: Transaction,
  ): Promise<void> {
    await UserRole.destroy({ where: { userId }, transaction });

    const assignments: TUserRoleCreationAttributes[] = roles.map((role) => ({
      userId,
      role,
    }));

    await UserRole.bulkCreate(assignments, { transaction });
  }

  create(
    assignments: TUserRoleCreationAttributes[],
    transaction: Transaction,
  ): Promise<UserRole[]> {
    return UserRole.bulkCreate(assignments, { transaction });
  }
}
