import { CursorPaginationDto } from '@Dto/cursor-pagination.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GetCatalogueMaintenanceDto extends CursorPaginationDto {
  @IsOptional() @IsString() @MaxLength(200) declare search?: string;
}
