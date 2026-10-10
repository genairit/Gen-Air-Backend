import { Module } from '@nestjs/common';
import { ProjectTypeService } from './project-type.service';
import { ProjectTypeController } from './project-type.controller';
import { ProjectTypeRepository } from './project-type.repository';
import { DatabaseModule } from '@Providers/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ProjectTypeController],
  providers: [ProjectTypeService, ProjectTypeRepository],
  exports: [ProjectTypeService],
})
export class ProjectTypeModule {}
