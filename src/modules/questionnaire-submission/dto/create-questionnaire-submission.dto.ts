import {
  IsUUID,
  Matches,
  IsArray,
  IsString,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';

import { Type, Transform } from 'class-transformer';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { QuestionnaireAnswerDto } from './questionnaire-answer.dto';
import { QUESTIONNAIRE_LIMITS } from '@Modules/questionnaire/constants/questionnaire.constant';

export class CreateQuestionnaireSubmissionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID()
  declare questionnaireId: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID('4')
  declare requestId: string;
  @IsString()
  @MaxLength(FIELD_LENGTHS.QUESTIONNAIRE_IDENTITY)
  @Matches(/\S/)
  declare fullName: string;
  @IsString()
  @MaxLength(FIELD_LENGTHS.QUESTIONNAIRE_IDENTITY)
  @Matches(/\S/)
  declare role: string;
  @IsString()
  @MaxLength(FIELD_LENGTHS.QUESTIONNAIRE_IDENTITY)
  @Matches(/\S/)
  declare department: string;
  @IsArray()
  @ArrayMinSize(QUESTIONNAIRE_LIMITS.ANSWER_COUNT)
  @ArrayMaxSize(QUESTIONNAIRE_LIMITS.ANSWER_COUNT)
  @ValidateNested({ each: true })
  @Type(() => QuestionnaireAnswerDto)
  declare answers: QuestionnaireAnswerDto[];
}
