import { Transaction } from 'sequelize';
import { Injectable } from '@nestjs/common';
import { UserRoleAuditRepository } from './user-role-audit.repository';
import { TUserRoleAuditCreationAttributes } from './interfaces/user-role-audit.interface';

@Injectable()
export class UserRoleAuditService {
  constructor(private readonly repository: UserRoleAuditRepository) {}

  async record(
    attributes: TUserRoleAuditCreationAttributes,
    transaction: Transaction,
  ): Promise<void> {
    await this.repository.create(attributes, transaction);
  }
}
