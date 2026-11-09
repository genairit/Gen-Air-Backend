import {
  Max,
  Min,
  IsInt,
  IsUUID,
  IsArray,
  Matches,
  IsString,
  IsBoolean,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';
import { IntersectionType } from '@nestjs/swagger';
import { ProjectLightingDto } from './project-lighting.dto';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { APARTMENT } from '../constants/project-apartment.constant';
import { CUSTOMER_FLOOR_RANGE } from '@Constants/field-validation.constant';
import { ApartmentCommercialDetailsDto } from './apartment-commercial-details.dto';
import { AssignProjectMemberDto } from '@Modules/project-member/dto/assign-project-member.dto';

export class CreateApartmentDto extends IntersectionType(
  ApartmentCommercialDetailsDto,
  ProjectLightingDto,
) {
  @ValidateIf((value: object) => 'hasOwnLighting' in value)
  @IsBoolean()
  declare hasOwnLighting?: boolean;
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
