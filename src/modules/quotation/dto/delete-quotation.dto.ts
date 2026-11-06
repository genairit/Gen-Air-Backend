import { Max, Min, IsInt, IsNotEmpty } from 'class-validator';

export class DeleteQuotationDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  declare version: number;
}
