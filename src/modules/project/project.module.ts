import { ProjectService } from './project.service';
import { Module, forwardRef } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { ProjectRepository } from './project.repository';
import { AddressModule } from '@Modules/address/address.module';
import { ProjectIntakeService } from './project-intake.service';
import { CustomerModule } from '@Modules/customer/customer.module';
import { CustomerProjectService } from './customer-project.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { ProjectApartmentService } from './project-apartment.service';
import { CustomerProjectController } from './customer-project.controller';
import { CustomerProjectRepository } from './customer-project.repository';
import { ProjectTypeModule } from '@Modules/project-type/project-type.module';
import { ProjectStageModule } from '@Modules/project-stage/project-stage.module';
import { ProjectApartmentImportService } from './project-apartment-import.service';
import { ProjectMemberModule } from '@Modules/project-member/project-member.module';
import { ProjectContactService } from '@Modules/project-contact/project-contact.service';
import { ProjectApartmentImportController } from './project-apartment-import.controller';
import { CustomerContactModule } from '@Modules/customer-contact/customer-contact.module';
import { ProjectContactController } from '@Modules/project-contact/project-contact.controller';
import { ProjectStageTransitionModule } from '@Modules/project-stage-transition/project-stage-transition.module';

@Module({
  imports: [
    DatabaseModule,
    AddressModule,
    CustomerModule,
    CustomerContactModule,
    ProjectTypeModule,
    ProjectMemberModule,
    ProjectStageTransitionModule,
    forwardRef(() => ProjectStageModule),
  ],
  controllers: [
    ProjectController,
    ProjectApartmentImportController,
    CustomerProjectController,
    ProjectContactController,
  ],
  providers: [
    ProjectService,
    CustomerProjectService,
    ProjectContactService,
    CustomerProjectRepository,
    ProjectRepository,
    ProjectIntakeService,
    ProjectApartmentService,
    ProjectApartmentImportService,
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
