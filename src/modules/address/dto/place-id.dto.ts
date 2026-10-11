import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { Matches, IsString, MaxLength, IsNotEmpty } from 'class-validator';
import { GOOGLE_PLACE_ID_PATTERN } from '@Constants/google-places.constant';

export class PlaceIdDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.PLACE_ID)
  @Matches(GOOGLE_PLACE_ID_PATTERN, { message: 'placeId is not a place id' })
  declare placeId: string;
}
