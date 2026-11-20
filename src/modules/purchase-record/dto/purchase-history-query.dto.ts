import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class PurchaseHistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  declare search?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f-]{36}$/)
  declare cursor?: string;
}
