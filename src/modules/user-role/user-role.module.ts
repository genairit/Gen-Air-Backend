import { Module } from '@nestjs/common';
import { UserRoleService } from './user-role.service';
import { UserRoleRepository } from './user-role.repository';
import { DatabaseModule } from '@Providers/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [UserRoleService, UserRoleRepository],
  exports: [UserRoleService],
})
export class UserRoleModule {}
