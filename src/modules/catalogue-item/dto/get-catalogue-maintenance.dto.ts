import {
  IsString,
  MaxLength,
  IsOptional,
  IsBooleanString,
} from 'class-validator';

import { CursorPaginationDto } from '@Dto/cursor-pagination.dto';

export class GetCatalogueMaintenanceDto extends CursorPaginationDto {
  @IsOptional() @IsString() @MaxLength(200) declare search?: string;
  @IsOptional() @IsBooleanString() declare pricedOnly?: string;
  @IsOptional() @IsBooleanString() declare excludeArchived?: string;
}
