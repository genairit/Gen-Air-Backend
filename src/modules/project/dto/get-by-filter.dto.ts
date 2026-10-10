import { IntersectionType } from '@nestjs/swagger';
import { IsUUID, IsOptional } from 'class-validator';
import { CursorPaginationDto } from '@Dto/cursor-pagination.dto';
import { GetProjectCountsByFilterDto } from './get-counts-by-filter.dto';

export class GetProjectsByFilterDto extends IntersectionType(
  CursorPaginationDto,
  GetProjectCountsByFilterDto,
) {
  @IsOptional()
  @IsUUID()
  declare stageId?: string;
}
