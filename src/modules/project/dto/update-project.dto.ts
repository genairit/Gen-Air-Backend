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
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { ProjectCustomerDetailsDto } from './project-customer-details.dto';
import { AssignProjectMemberDto } from '@Modules/project-member/dto/assign-project-member.dto';

export class UpdateProjectDto extends ProjectCustomerDetailsDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.PROJECT_NAME)
  declare name?: string;

  @IsOptional()
  @IsUUID()
  declare projectTypeId?: string;

  @IsOptional()
  @IsUUID()
  declare stageId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignProjectMemberDto)
  declare members?: AssignProjectMemberDto[];
}
