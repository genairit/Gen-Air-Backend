import { Module } from '@nestjs/common';
import { QuestionnaireService } from './questionnaire.service';
import { DatabaseModule } from '@Providers/database/database.module';
import { QuestionnaireRepository } from './questionnaire.repository';
import { QuestionnaireController } from './questionnaire.controller';
import { QuestionnaireLimitGuard } from './questionnaire-limit.guard';

@Module({
  imports: [DatabaseModule],
  providers: [
    QuestionnaireService,
    QuestionnaireRepository,
    QuestionnaireLimitGuard,
  ],
  controllers: [QuestionnaireController],
  exports: [QuestionnaireService, QuestionnaireLimitGuard],
})
export class QuestionnaireModule {}
