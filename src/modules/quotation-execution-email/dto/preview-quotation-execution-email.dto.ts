import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { QUOTATION_EMAIL_LIMITS } from '../constants/quotation-execution-email.constant';

export class PreviewQuotationExecutionEmailDto {
  @IsUUID()
  declare architectContactId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(QUOTATION_EMAIL_LIMITS.MAX_PLAN_VERSION)
  declare planVersion: string;
}
