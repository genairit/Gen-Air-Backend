import { IsUUID, ValidateIf } from 'class-validator';

export class SetProjectContactRoleDto {
  @ValidateIf((input: SetProjectContactRoleDto) => input.contactId !== null)
  @IsUUID()
  declare contactId: string | null;
}
