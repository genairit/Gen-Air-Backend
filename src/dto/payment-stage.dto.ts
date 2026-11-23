import {
  PAYMENT_CONFIGURATION_LIMITS,
  PAYMENT_CONFIGURATION_PATTERNS,
} from '@Constants/payment-configuration.constant';

import { Matches, IsString, MaxLength } from 'class-validator';

export class PaymentStageDto {
  @Matches(PAYMENT_CONFIGURATION_PATTERNS.PERCENT)
  declare percent: string;

  @IsString()
  @MaxLength(PAYMENT_CONFIGURATION_LIMITS.STAGE_TEXT)
  declare text: string;
}
