import { CursorPaginationDto } from '@Dto/cursor-pagination.dto';
import { IsString, MaxLength, IsOptional, IsIn } from 'class-validator';

export class GetCatalogueMaintenanceDto extends CursorPaginationDto {
  @IsOptional() @IsString() @MaxLength(200) declare search?: string;
  @IsOptional() @IsIn(['true', 'false']) declare pricedOnly?: string;
  @IsOptional() @IsIn(['true', 'false']) declare excludeArchived?: string;
}
