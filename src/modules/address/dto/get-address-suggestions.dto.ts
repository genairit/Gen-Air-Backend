import { AddressSessionDto } from './address-session.dto';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsString, MaxLength, IsNotEmpty } from 'class-validator';

export class GetAddressSuggestionsDto extends AddressSessionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.ADDRESS_SEARCH)
  declare input: string;
}
