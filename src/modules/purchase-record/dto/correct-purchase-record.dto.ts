import { IsUUID, IsString, MaxLength } from 'class-validator';

export class CorrectPurchaseRecordDto {
  @IsUUID()
  declare idempotencyKey: string;

  @IsString()
  @MaxLength(1000)
  declare reason: string;
}
