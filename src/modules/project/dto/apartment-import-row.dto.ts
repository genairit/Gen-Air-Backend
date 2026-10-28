import { PickType } from '@nestjs/swagger';
import { CreateApartmentDto } from './create-apartment.dto';

export class ApartmentImportRowDto extends PickType(CreateApartmentDto, [
  'customerFloor',
  'customerApartment',
  'apartmentOwnership',
  'apartmentCredit',
] as const) {}
