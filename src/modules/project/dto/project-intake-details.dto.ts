import { IsOptional } from 'class-validator';
import { IsGooglePlaceId } from '@Decorators/is-google-place-id.decorator';

export class ProjectIntakeDetailsDto {
  @IsOptional()
  @IsGooglePlaceId()
  declare addressPlaceId?: string | null;
}
