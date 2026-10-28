import {
  IsIn,
  Matches,
  IsString,
  MaxLength,
  IsOptional,
} from 'class-validator';

import {
  APARTMENT_COMMERCIAL,
  APARTMENT_OWNERSHIP_OPTIONS,
  type ApartmentOwnershipType,
} from '../constants/apartment-commercial.constant';

import { Trim } from '@Decorators/trim.decorator';

export class ApartmentCommercialDetailsDto {
  @IsOptional()
  @IsIn(APARTMENT_OWNERSHIP_OPTIONS.map(({ value }) => value))
  declare apartmentOwnership?: ApartmentOwnershipType | null;

  @Trim()
  @IsOptional()
  @IsString()
  @Matches(APARTMENT_COMMERCIAL.CREDIT_PATTERN)
  @MaxLength(APARTMENT_COMMERCIAL.CREDIT_MAX_LENGTH)
  declare apartmentCredit?: string | null;
}
