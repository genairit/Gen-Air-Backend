import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { TaskModule } from '@Modules/task/task.module';
import { AuthModule } from '@Modules/auth/auth.module';
import { UserModule } from '@Modules/user/user.module';
import { JennyModule } from '@Modules/jenny/jenny.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AddressModule } from '@Modules/address/address.module';
import { ProjectModule } from '@Modules/project/project.module';
import { MaterialModule } from '@Modules/material/material.module';
import { CustomerModule } from '@Modules/customer/customer.module';
import { QuotationModule } from '@Modules/quotation/quotation.module';
import { DatabaseModule } from './providers/database/database.module';
import { ProjectBoqModule } from '@Modules/project-boq/project-boq.module';
import { ProjectTypeModule } from '@Modules/project-type/project-type.module';
import { ProjectDriveModule } from '@Modules/project-drive/project-drive.module';
import { ProjectStageModule } from '@Modules/project-stage/project-stage.module';
import { ProjectMemberModule } from '@Modules/project-member/project-member.module';
import { ExecutionPlanModule } from '@Modules/execution-plan/execution-plan.module';
import { PurchaseRecordModule } from '@Modules/purchase-record/purchase-record.module';
import { CustomerContactModule } from '@Modules/customer-contact/customer-contact.module';
import { SupplierAgreementModule } from '@Modules/supplier-agreement/supplier-agreement.module';
import { EngineeringEstimateModule } from '@Modules/engineering-estimate/engineering-estimate.module';
import { DriveTemplateFolderModule } from '@Modules/drive-template-folder/drive-template-folder.module';
import { ProjectStageTransitionModule } from '@Modules/project-stage-transition/project-stage-transition.module';
import { QuotationExecutionEmailModule } from '@Modules/quotation-execution-email/quotation-execution-email.module';

@Module({
  imports: [
    DatabaseModule,
    MaterialModule,
    QuotationModule,
    EngineeringEstimateModule,
    QuotationExecutionEmailModule,
    ExecutionPlanModule,
    EventEmitterModule.forRoot(),
    AddressModule,
    AuthModule,
    CustomerModule,
    CustomerContactModule,
    DriveTemplateFolderModule,
    JennyModule,
    ProjectModule,
    ProjectBoqModule,
    PurchaseRecordModule,
    SupplierAgreementModule,
    ProjectDriveModule,
    ProjectMemberModule,
    ProjectStageModule,
    ProjectStageTransitionModule,
    ProjectTypeModule,
    TaskModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
