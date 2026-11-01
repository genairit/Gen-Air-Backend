import { ApiTags } from '@nestjs/swagger';
import { Public } from '@Decorators/public.decorator';
import { QuestionnaireService } from './questionnaire.service';
import { GetQuestionnaireDto } from './dto/get-questionnaire.dto';
import { QuestionnaireLimitGuard } from './questionnaire-limit.guard';
import { Controller, Get, Param, UseGuards, Header } from '@nestjs/common';

@ApiTags('questionnaire')
@Controller('questionnaire')
export class QuestionnaireController {
  constructor(private readonly service: QuestionnaireService) {}
  @Public()
  @Get(':slug')
  @UseGuards(QuestionnaireLimitGuard)
  @Header('Cache-Control', 'no-store')
  findActive(@Param() params: GetQuestionnaireDto) {
    return this.service.findActive(params.slug);
  }
}
