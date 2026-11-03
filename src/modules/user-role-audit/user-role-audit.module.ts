import { Module } from '@nestjs/common';
import { UserRoleAuditService } from './user-role-audit.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { UserRoleAuditRepository } from './user-role-audit.repository';

@Module({
  imports: [DatabaseModule],
  providers: [UserRoleAuditService, UserRoleAuditRepository],
  exports: [UserRoleAuditService],
})
export class UserRoleAuditModule {}
