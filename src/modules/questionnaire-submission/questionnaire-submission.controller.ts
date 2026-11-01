import { ApiTags } from '@nestjs/swagger';
import { Public } from '@Decorators/public.decorator';
import { Body, Post, Controller, UseGuards, Header } from '@nestjs/common';
import { QuestionnaireSubmissionService } from './questionnaire-submission.service';
import { QuestionnaireLimitGuard } from '@Modules/questionnaire/questionnaire-limit.guard';
import { CreateQuestionnaireSubmissionDto } from './dto/create-questionnaire-submission.dto';

@ApiTags('questionnaire-submission')
@Controller('questionnaire-submission')
export class QuestionnaireSubmissionController {
  constructor(private readonly service: QuestionnaireSubmissionService) {}
  @Public()
  @Post()
  @UseGuards(QuestionnaireLimitGuard)
  @Header('Cache-Control', 'no-store')
  submit(@Body() input: CreateQuestionnaireSubmissionDto) {
    return this.service.submit(input);
  }
}
