import { TIME_UNITS } from './date';

export const GOOGLE_PLACES = {
  REGION_CODE: 'il',
  COUNTRY_CODE: 'IL',
  LANGUAGE_CODE: 'he',
  AUTOCOMPLETE_PATH: '/places:autocomplete',
  API_KEY_HEADER: 'X-Goog-Api-Key',
  FIELD_MASK_HEADER: 'X-Goog-FieldMask',
  BASE_URL: 'https://places.googleapis.com/v1',
  PLACE_FIELDS: 'id,formattedAddress,addressComponents',
  REQUEST_TIMEOUT_MS: 5 * TIME_UNITS.SECONDS,
  SUGGESTION_FIELDS:
    'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
} as const;

export const GOOGLE_PLACES_COMPONENT_TYPES = {
  CITY: 'locality',
  COUNTRY: 'country',
} as const;

export const GOOGLE_PLACE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
