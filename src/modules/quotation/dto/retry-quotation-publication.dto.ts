import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class RetryQuotationPublicationDto {
  @IsUUID()
  declare cycleId: string;
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  declare generation: number;
}
