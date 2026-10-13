import { CursorPaginationDto } from '@Dto/cursor-pagination.dto';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsUUID, IsString, MaxLength, IsOptional } from 'class-validator';

export class GetApartmentsByFilterDto extends CursorPaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.SEARCH_QUERY)
  declare search?: string;

  @IsOptional()
  @IsUUID()
  declare stageId?: string;
}
