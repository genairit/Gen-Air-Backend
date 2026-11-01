import { Module } from '@nestjs/common';
import { DatabaseModule } from '@Providers/database/database.module';
import { QuestionnaireModule } from '@Modules/questionnaire/questionnaire.module';
import { QuestionnaireSubmissionService } from './questionnaire-submission.service';
import { QuestionnaireSubmissionRepository } from './questionnaire-submission.repository';
import { QuestionnaireSubmissionController } from './questionnaire-submission.controller';

@Module({
  imports: [DatabaseModule, QuestionnaireModule],
  providers: [
    QuestionnaireSubmissionService,
    QuestionnaireSubmissionRepository,
  ],
  controllers: [QuestionnaireSubmissionController],
  exports: [QuestionnaireSubmissionService],
})
export class QuestionnaireSubmissionModule {}
