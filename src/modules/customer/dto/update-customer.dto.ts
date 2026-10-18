import {
  IsIn,
  IsEmail,
  Matches,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';

import {
  type ProjectDetailFieldSetType,
  PROJECT_DETAIL_FIELD_SET_VALUES,
} from '@Constants/project-detail-field-set.constant';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { FIELD_VALIDATION_REGEX } from '@Constants/field-validation.constant';
import { IsIsraeliCompanyNumber } from '@Decorators/is-israeli-company-number.decorator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsIn(PROJECT_DETAIL_FIELD_SET_VALUES)
  declare customerType?: ProjectDetailFieldSetType;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.CUSTOMER_NAME)
  declare name?: string;

  @IsOptional()
  @IsString()
  @IsIsraeliCompanyNumber()
  declare taxId?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.STREET_ADDRESS)
  declare address?: string;

  @IsOptional()
  @IsString()
  @MinLength(FIELD_LENGTHS.CONTACT_NAME_MIN)
  @MaxLength(FIELD_LENGTHS.CONTACT_NAME)
  declare contactName?: string;

  @IsOptional()
  @IsString()
  @Matches(FIELD_VALIDATION_REGEX.ISRAELI_PHONE, {
    message: 'phone must be an Israeli phone number, e.g. 052-1234567',
  })
  declare phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(FIELD_LENGTHS.EMAIL)
  declare email?: string;
}
