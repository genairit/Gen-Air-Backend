import {
  Max,
  Min,
  IsInt,
  Length,
  IsArray,
  Matches,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';

import {
  CUSTOMER_FLOOR_RANGE,
  FIELD_VALIDATION_REGEX,
} from '@Constants/field-validation.constant';

import { Type } from 'class-transformer';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { AssignProjectMemberDto } from '@Modules/project-member/dto/assign-project-member.dto';

export class CreateApartmentDto {
  @IsNotEmpty()
  @IsInt()
  @Min(CUSTOMER_FLOOR_RANGE.MIN)
  @Max(CUSTOMER_FLOOR_RANGE.MAX)
  declare customerFloor: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.APARTMENT)
  declare customerApartment: string;

  @IsNotEmpty()
  @IsString()
  @Length(FIELD_LENGTHS.CONTACT_NAME_MIN, FIELD_LENGTHS.CONTACT_NAME)
  declare contactName: string;

  @IsNotEmpty()
  @IsString()
  @Matches(FIELD_VALIDATION_REGEX.ISRAELI_MOBILE_PHONE, {
    message: 'contactPhone must be an Israeli mobile number, e.g. 052-1234567',
  })
  declare contactPhone: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.CONTACT_ROLE)
  declare contactRole: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.CUSTOMER_NAME)
  declare customerName?: string | null;

  @IsOptional()
  @IsString()
  @Matches(FIELD_VALIDATION_REGEX.ISRAELI_PHONE, {
    message: 'customerPhone must be an Israeli phone number, e.g. 052-1234567',
  })
  declare customerPhone?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignProjectMemberDto)
  declare members?: AssignProjectMemberDto[];
}
