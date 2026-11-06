import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { DatabaseModule } from '@Providers/database/database.module';
import { UserRoleModule } from '@Modules/user-role/user-role.module';
import { UserRoleAuditModule } from '@Modules/user-role-audit/user-role-audit.module';

@Module({
  imports: [DatabaseModule, UserRoleModule, UserRoleAuditModule],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}
