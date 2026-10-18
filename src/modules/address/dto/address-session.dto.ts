import { IsUUID, IsOptional } from 'class-validator';

export class AddressSessionDto {
  @IsOptional()
  @IsUUID('4')
  declare sessionToken?: string;
}
