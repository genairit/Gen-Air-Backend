import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { UserRoleAudit } from './entities/user-role-audit.entity';
import { TUserRoleAuditCreationAttributes } from './interfaces/user-role-audit.interface';

@Injectable()
export class UserRoleAuditRepository {
  create(
    attributes: TUserRoleAuditCreationAttributes,
    transaction: Transaction,
  ): Promise<UserRoleAudit> {
    return UserRoleAudit.create(attributes, { transaction });
  }
}
