import { ProjectService } from './project.service';
import { Module, forwardRef } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { ProjectRepository } from './project.repository';
import { TaskDataModule } from '@Modules/task/task-data.module';
import { AddressModule } from '@Modules/address/address.module';
import { ProjectIntakeService } from './project-intake.service';
import { CustomerModule } from '@Modules/customer/customer.module';
import { DatabaseModule } from '@Providers/database/database.module';
import { ProjectApartmentService } from './project-apartment.service';
import { ProjectTypeModule } from '@Modules/project-type/project-type.module';
import { ProjectStageModule } from '@Modules/project-stage/project-stage.module';
import { ProjectApartmentImportService } from './project-apartment-import.service';
import { ProjectMemberModule } from '@Modules/project-member/project-member.module';
import { ProjectTaskInitializationService } from './project-task-initialization.service';
import { ProjectApartmentImportController } from './project-apartment-import.controller';
import { CustomerContactModule } from '@Modules/customer-contact/customer-contact.module';
import { ProjectStageTransitionModule } from '@Modules/project-stage-transition/project-stage-transition.module';

@Module({
  imports: [
    DatabaseModule,
    TaskDataModule,
    AddressModule,
    CustomerModule,
    CustomerContactModule,
    ProjectTypeModule,
    ProjectMemberModule,
    ProjectStageTransitionModule,
    forwardRef(() => ProjectStageModule),
  ],
  controllers: [ProjectController, ProjectApartmentImportController],
  providers: [
    ProjectService,
    ProjectTaskInitializationService,
    ProjectRepository,
    ProjectIntakeService,
    ProjectApartmentService,
    ProjectApartmentImportService,
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
