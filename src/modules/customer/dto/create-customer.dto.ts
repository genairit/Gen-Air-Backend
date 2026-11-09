import {
  IsIn,
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';

import {
  PAYMENT_TERMS_VALUES,
  type PaymentTermsType,
} from '@Constants/payment-terms.constant';

import {
  type ProjectDetailFieldSetType,
  PROJECT_DETAIL_FIELD_SET_VALUES,
} from '@Constants/project-detail-field-set.constant';

import { ValidateIf } from 'class-validator';
import { Trim } from '@Decorators/trim.decorator';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { NullIfBlank } from '@Decorators/null-if-blank.decorator';
import { IsDialablePhone } from '@Decorators/is-dialable-phone.decorator';
import { IsIsraeliCompanyNumber } from '@Decorators/is-israeli-company-number.decorator';

export class CreateCustomerDto {
  @ValidateIf((_object, value) => value != null)
  @IsIn(PAYMENT_TERMS_VALUES)
  declare paymentTerms?: PaymentTermsType | null;

  @IsNotEmpty()
  @IsIn(PROJECT_DETAIL_FIELD_SET_VALUES)
  declare customerType: ProjectDetailFieldSetType;

  @Trim()
  @IsNotEmpty()
  @IsString()
  @MinLength(FIELD_LENGTHS.REQUIRED_TEXT_MIN)
  @MaxLength(FIELD_LENGTHS.CUSTOMER_NAME)
  declare name: string;

  @Trim()
  @IsNotEmpty()
  @IsString()
  @IsIsraeliCompanyNumber()
  declare taxId: string;

  @Trim()
  @IsNotEmpty()
  @IsString()
  @MinLength(FIELD_LENGTHS.REQUIRED_TEXT_MIN)
  @MaxLength(FIELD_LENGTHS.STREET_ADDRESS)
  declare address: string;

  @Trim()
  @NullIfBlank()
  @IsOptional()
  @IsString()
  @MinLength(FIELD_LENGTHS.CONTACT_NAME_MIN)
  @MaxLength(FIELD_LENGTHS.CONTACT_NAME)
  declare contactName?: string | null;

  @Trim()
  @NullIfBlank()
  @IsOptional()
  @IsDialablePhone()
  @MaxLength(FIELD_LENGTHS.PHONE)
  declare phone?: string | null;

  @Trim()
  @NullIfBlank()
  @IsOptional()
  @IsEmail()
  @MaxLength(FIELD_LENGTHS.EMAIL)
  declare email?: string | null;
}
