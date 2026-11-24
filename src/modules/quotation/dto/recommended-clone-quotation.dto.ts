import { Min, IsInt, IsUUID, IsString, MaxLength } from 'class-validator';

export class RecommendedCloneQuotationDto {
  @IsInt()
  @Min(1)
  declare sourceVersion: number;
  @IsString()
  @MaxLength(100)
  declare targetBrand: string;
  @IsUUID()
  declare idempotencyKey: string;
}
