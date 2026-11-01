import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GetQuotationCountsDto {
  @IsOptional() @IsString() @MaxLength(200) declare search?: string;
}
