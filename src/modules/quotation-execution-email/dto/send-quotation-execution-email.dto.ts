import {
  IsUUID,
  Matches,
  IsArray,
  IsString,
  MaxLength,
  IsNotEmpty,
  ArrayUnique,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

import { GOOGLE_DRIVE_ID_PATTERN } from '@Constants/google-drive.constant';
import { QUOTATION_EMAIL_LIMITS } from '../constants/quotation-execution-email.constant';

export class SendQuotationExecutionEmailDto {
  @IsUUID()
  declare requestId: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @ArrayMaxSize(QUOTATION_EMAIL_LIMITS.MAX_RECIPIENTS)
  @IsUUID('all', { each: true })
  declare recipientContactIds: string[];

  @IsUUID()
  declare architectContactId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(QUOTATION_EMAIL_LIMITS.MAX_PLAN_VERSION)
  declare planVersion: string;

  @MaxLength(128)
  @Matches(GOOGLE_DRIVE_ID_PATTERN)
  declare planFileId: string;

  @MaxLength(128)
  @Matches(GOOGLE_DRIVE_ID_PATTERN)
  declare zipFileId: string;
}
