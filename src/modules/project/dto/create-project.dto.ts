import {
  IsUUID,
  IsArray,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';
import { IntersectionType } from '@nestjs/swagger';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { ProjectIntakeDetailsDto } from './project-intake-details.dto';
import { ProjectCustomerDetailsDto } from './project-customer-details.dto';
import { AssignProjectMemberDto } from '@Modules/project-member/dto/assign-project-member.dto';

export class CreateProjectDto extends IntersectionType(
  ProjectCustomerDetailsDto,
  ProjectIntakeDetailsDto,
) {
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.PROJECT_NAME)
  declare name: string;

  @IsNotEmpty()
  @IsUUID()
  declare projectTypeId: string;

  @IsOptional()
  @IsUUID()
  declare customerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.PROJECT_NOTES)
  declare notes?: string | null;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignProjectMemberDto)
  declare members: AssignProjectMemberDto[];
}
