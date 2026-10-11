import { applyDecorators } from '@nestjs/common';
import { Matches, IsString, MaxLength } from 'class-validator';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { GOOGLE_PLACE_ID_PATTERN } from '@Constants/google-places.constant';

export const IsGooglePlaceId = () =>
  applyDecorators(
    IsString(),
    MaxLength(FIELD_LENGTHS.PLACE_ID),
    Matches(GOOGLE_PLACE_ID_PATTERN, {
      message: ({ property }) => `${property} is not a Google place id`,
    }),
  );
