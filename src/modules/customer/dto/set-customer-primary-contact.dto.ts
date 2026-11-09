import { IsUUID, ValidateIf } from 'class-validator';

export class SetCustomerPrimaryContactDto {
  @ValidateIf((_input, value) => value !== null)
  @IsUUID()
  declare contactId: string | null;
}
