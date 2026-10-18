import {
  IsUUID,
  IsArray,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';
import { IntersectionType } from '@nestjs/swagger';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { ProjectIntakeDetailsDto } from './project-intake-details.dto';
import { ProjectCustomerDetailsDto } from './project-customer-details.dto';
import { AssignProjectMemberDto } from '@Modules/project-member/dto/assign-project-member.dto';

export class UpdateProjectDto extends IntersectionType(
  ProjectCustomerDetailsDto,
  ProjectIntakeDetailsDto,
) {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.PROJECT_NAME)
  declare name?: string;

  @IsOptional()
  @IsUUID()
  declare projectTypeId?: string;

  @ValidateIf((changes: object) => 'customerId' in changes)
  @IsUUID()
  declare customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.PROJECT_NOTES)
  declare notes?: string | null;

  @IsOptional()
  @IsUUID()
  declare stageId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignProjectMemberDto)
  declare members?: AssignProjectMemberDto[];
}
