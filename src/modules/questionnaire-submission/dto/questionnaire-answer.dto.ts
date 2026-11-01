import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsString, MaxLength, IsNotEmpty } from 'class-validator';

export class QuestionnaireAnswerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LENGTHS.QUESTIONNAIRE_KEY)
  declare questionKey: string;
  @IsString()
  @MaxLength(FIELD_LENGTHS.QUESTIONNAIRE_ANSWER)
  declare value: string;
}
