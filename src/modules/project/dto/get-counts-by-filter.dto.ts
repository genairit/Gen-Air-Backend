import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsUUID, IsString, MaxLength, IsOptional } from 'class-validator';

export class GetProjectCountsByFilterDto {
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.SEARCH_QUERY)
  declare search?: string;

  @IsOptional()
  @IsUUID()
  declare projectTypeId?: string;

  @IsOptional()
  @IsUUID()
  declare managerId?: string;
}
