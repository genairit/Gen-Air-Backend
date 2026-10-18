import { ProjectService } from './project.service';
import { Module, forwardRef } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { ProjectRepository } from './project.repository';
import { AddressModule } from '@Modules/address/address.module';
import { ProjectIntakeService } from './project-intake.service';
import { CustomerModule } from '@Modules/customer/customer.module';
import { DatabaseModule } from '@Providers/database/database.module';
import { ProjectApartmentService } from './project-apartment.service';
import { ProjectTypeModule } from '@Modules/project-type/project-type.module';
import { ProjectStageModule } from '@Modules/project-stage/project-stage.module';
import { ProjectMemberModule } from '@Modules/project-member/project-member.module';
import { ProjectStageTransitionModule } from '@Modules/project-stage-transition/project-stage-transition.module';

@Module({
  imports: [
    DatabaseModule,
    AddressModule,
    CustomerModule,
    ProjectTypeModule,
    ProjectMemberModule,
    ProjectStageTransitionModule,
    forwardRef(() => ProjectStageModule),
  ],
  controllers: [ProjectController],
  providers: [
    ProjectService,
    ProjectRepository,
    ProjectIntakeService,
    ProjectApartmentService,
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
