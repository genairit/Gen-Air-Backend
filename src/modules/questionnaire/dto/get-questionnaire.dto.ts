import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsString, Matches, MaxLength, IsNotEmpty } from 'class-validator';

export class GetQuestionnaireDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.QUESTIONNAIRE_SLUG)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  declare slug: string;
}
