import { IsUUID, IsArray, ArrayUnique, ArrayMaxSize } from 'class-validator';
import { MAX_SHARED_APARTMENTS } from '../constants/quotation-sharing.constant';

export class SetApartmentLinksDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_SHARED_APARTMENTS)
  @IsUUID('all', { each: true })
  declare expectedApartmentIds: string[];

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_SHARED_APARTMENTS)
  @IsUUID('all', { each: true })
  declare apartmentIds: string[];
}
