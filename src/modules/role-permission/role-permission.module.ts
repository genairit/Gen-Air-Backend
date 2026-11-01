import { Module } from '@nestjs/common';
import { RolePermissionService } from './role-permission.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { RolePermissionRepository } from './role-permission.repository';

@Module({
  imports: [DatabaseModule],
  providers: [RolePermissionService, RolePermissionRepository],
  exports: [RolePermissionService],
})
export class RolePermissionModule {}
