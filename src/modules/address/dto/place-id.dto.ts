import { IsNotEmpty } from 'class-validator';
import { IsGooglePlaceId } from '@Decorators/is-google-place-id.decorator';

export class PlaceIdDto {
  @IsNotEmpty()
  @IsGooglePlaceId()
  declare placeId: string;
}
