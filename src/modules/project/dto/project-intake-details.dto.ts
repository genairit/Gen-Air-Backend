import {
  IsIn,
  Length,
  Matches,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

import {
  PaymentTermsType,
  PAYMENT_TERMS_VALUES,
} from '@Constants/payment-terms.constant';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsGooglePlaceId } from '@Decorators/is-google-place-id.decorator';
import { FIELD_VALIDATION_REGEX } from '@Constants/field-validation.constant';

export class ProjectIntakeDetailsDto {
  @IsOptional()
  @IsGooglePlaceId()
  declare addressPlaceId?: string | null;

  @IsOptional()
  @IsString()
  @Length(FIELD_LENGTHS.CONTACT_NAME_MIN, FIELD_LENGTHS.CONTACT_NAME)
  declare contactName?: string | null;

  @IsOptional()
  @IsString()
  @Matches(FIELD_VALIDATION_REGEX.ISRAELI_MOBILE_PHONE, {
    message: 'contactPhone must be an Israeli mobile number, e.g. 052-1234567',
  })
  declare contactPhone?: string | null;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.CONTACT_ROLE)
  declare contactRole?: string | null;

  @IsOptional()
  @IsIn(PAYMENT_TERMS_VALUES)
  declare paymentTerms?: PaymentTermsType | null;

  @IsOptional()
  @IsString()
  @Length(
    FIELD_LENGTHS.PAYMENT_TERMS_NOTE_MIN,
    FIELD_LENGTHS.PAYMENT_TERMS_NOTE,
  )
  declare paymentTermsNote?: string | null;
}
