import {
  IsUUID,
  IsArray,
  IsOptional,
  ArrayNotEmpty,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

export class CustomerProjectLinkDto {
  @IsUUID()
  declare projectId: string;

  @IsOptional()
  @IsUUID()
  declare expectedCustomerId: string | null;
}

export class LinkCustomerProjectsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CustomerProjectLinkDto)
  declare projects: CustomerProjectLinkDto[];
}
