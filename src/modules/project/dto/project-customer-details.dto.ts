import {
  Max,
  Min,
  IsInt,
  Matches,
  IsEmail,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

import {
  CUSTOMER_FLOOR_RANGE,
  FIELD_VALIDATION_REGEX,
} from '@Constants/field-validation.constant';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsIsraeliCompanyNumber } from '@Decorators/is-israeli-company-number.decorator';

export class ProjectCustomerDetailsDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.CUSTOMER_NAME)
  declare customerName?: string | null;

  @IsOptional()
  @IsIsraeliCompanyNumber()
  declare customerCompanyNumber?: string | null;

  @IsOptional()
  @IsString()
  @Matches(FIELD_VALIDATION_REGEX.ASSOCIATION_NUMBER, {
    message: 'customerAssociationNumber must be 9 digits starting with 58',
  })
  declare customerAssociationNumber?: string | null;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.STREET_ADDRESS)
  declare customerAddress?: string | null;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.CITY_NAME)
  declare customerCity?: string | null;

  @IsOptional()
  @IsString()
  @Matches(FIELD_VALIDATION_REGEX.ISRAELI_PHONE, {
    message: 'customerPhone must be an Israeli phone number, e.g. 052-1234567',
  })
  declare customerPhone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(FIELD_LENGTHS.EMAIL)
  declare customerEmail?: string | null;

  @IsOptional()
  @IsInt()
  @Min(CUSTOMER_FLOOR_RANGE.MIN)
  @Max(CUSTOMER_FLOOR_RANGE.MAX)
  declare customerFloor?: number | null;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.APARTMENT)
  declare customerApartment?: string | null;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.BUILDING_UNIT)
  declare customerUnit?: string | null;
}
