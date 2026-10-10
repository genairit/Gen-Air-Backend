import {
  IsUUID,
  IsArray,
  IsNotEmpty,
  ArrayUnique,
  ArrayNotEmpty,
} from 'class-validator';

export class ReorderProjectStagesDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  declare stageIds: string[];
}
