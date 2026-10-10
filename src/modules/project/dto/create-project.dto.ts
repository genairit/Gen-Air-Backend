import {
  IsUUID,
  IsArray,
  IsString,
  MaxLength,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { ProjectCustomerDetailsDto } from './project-customer-details.dto';
import { AssignProjectMemberDto } from '@Modules/project-member/dto/assign-project-member.dto';

export class CreateProjectDto extends ProjectCustomerDetailsDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.PROJECT_NAME)
  declare name: string;

  @IsNotEmpty()
  @IsUUID()
  declare projectTypeId: string;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignProjectMemberDto)
  declare members: AssignProjectMemberDto[];
}
