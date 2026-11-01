import {
  IsIn,
  IsEmail,
  Matches,
  IsString,
  MinLength,
  MaxLength,
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
import { FIELD_VALIDATION_REGEX } from '@Constants/field-validation.constant';
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
  @IsNotEmpty()
  @IsString()
  @MinLength(FIELD_LENGTHS.CONTACT_NAME_MIN)
  @MaxLength(FIELD_LENGTHS.CONTACT_NAME)
  declare contactName: string;

  @Trim()
  @IsNotEmpty()
  @IsString()
  @Matches(FIELD_VALIDATION_REGEX.ISRAELI_PHONE)
  declare phone: string;

  @Trim()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(FIELD_LENGTHS.EMAIL)
  declare email: string;
}
