import {
  Max,
  Min,
  IsInt,
  IsUUID,
  IsArray,
  Matches,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';
import { PickType } from '@nestjs/swagger';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { APARTMENT } from '../constants/project-apartment.constant';
import { ProjectIntakeDetailsDto } from './project-intake-details.dto';
import { CUSTOMER_FLOOR_RANGE } from '@Constants/field-validation.constant';
import { AssignProjectMemberDto } from '@Modules/project-member/dto/assign-project-member.dto';

export class CreateApartmentDto extends PickType(ProjectIntakeDetailsDto, [
  'paymentTerms',
  'paymentTermsNote',
] as const) {
  @IsNotEmpty()
  @IsInt()
  @Min(CUSTOMER_FLOOR_RANGE.MIN)
  @Max(CUSTOMER_FLOOR_RANGE.MAX)
  declare customerFloor: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.APARTMENT)
  @Matches(APARTMENT.NUMBER_PATTERN)
  declare customerApartment: string;

  @IsNotEmpty()
  @IsUUID()
  declare customerId: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignProjectMemberDto)
  declare members?: AssignProjectMemberDto[];
}
