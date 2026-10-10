import { Module } from '@nestjs/common';
import { UserModule } from '@Modules/user/user.module';
import { ProjectMemberService } from './project-member.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { ProjectMemberController } from './project-member.controller';
import { ProjectMemberRepository } from './project-member.repository';

@Module({
  imports: [DatabaseModule, UserModule],
  controllers: [ProjectMemberController],
  providers: [ProjectMemberService, ProjectMemberRepository],
  exports: [ProjectMemberService],
})
export class ProjectMemberModule {}
