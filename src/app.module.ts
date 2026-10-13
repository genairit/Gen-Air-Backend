import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { AuthModule } from '@Modules/auth/auth.module';
import { UserModule } from '@Modules/user/user.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AddressModule } from '@Modules/address/address.module';
import { ProjectModule } from '@Modules/project/project.module';
import { CustomerModule } from '@Modules/customer/customer.module';
import { DatabaseModule } from './providers/database/database.module';
import { ProjectTypeModule } from '@Modules/project-type/project-type.module';
import { ProjectDriveModule } from '@Modules/project-drive/project-drive.module';
import { ProjectStageModule } from '@Modules/project-stage/project-stage.module';
import { ProjectMemberModule } from '@Modules/project-member/project-member.module';
import { DriveTemplateFolderModule } from '@Modules/drive-template-folder/drive-template-folder.module';
import { ProjectStageTransitionModule } from '@Modules/project-stage-transition/project-stage-transition.module';

@Module({
  imports: [
    DatabaseModule,
    EventEmitterModule.forRoot(),
    AddressModule,
    AuthModule,
    CustomerModule,
    DriveTemplateFolderModule,
    ProjectModule,
    ProjectDriveModule,
    ProjectMemberModule,
    ProjectStageModule,
    ProjectStageTransitionModule,
    ProjectTypeModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
