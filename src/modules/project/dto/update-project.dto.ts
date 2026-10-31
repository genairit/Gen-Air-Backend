import {
  IsUUID,
  IsArray,
  IsString,
  IsBoolean,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { IntersectionType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { ProjectLightingDto } from './project-lighting.dto';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { ProjectIntakeDetailsDto } from './project-intake-details.dto';
import { ProjectCustomerDetailsDto } from './project-customer-details.dto';
import { ApartmentCommercialDetailsDto } from './apartment-commercial-details.dto';
import { AssignProjectMemberDto } from '@Modules/project-member/dto/assign-project-member.dto';

export class UpdateProjectDto extends IntersectionType(
  IntersectionType(ProjectCustomerDetailsDto, ProjectIntakeDetailsDto),
  IntersectionType(ApartmentCommercialDetailsDto, ProjectLightingDto),
) {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
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

  @ValidateIf((changes: object) => 'hasOwnTeam' in changes)
  @IsBoolean()
  declare hasOwnTeam?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignProjectMemberDto)
  declare members?: AssignProjectMemberDto[];
}
