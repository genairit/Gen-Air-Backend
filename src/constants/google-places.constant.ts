import { TIME_UNITS } from './date';

const DEFAULT_FORMATTING_COUNTRY_CODE = 'IL';
const SERVICE_COUNTRY_CODES = [DEFAULT_FORMATTING_COUNTRY_CODE, 'PS'] as const;

export const GOOGLE_PLACES = {
  SERVICE_COUNTRY_CODES,
  LANGUAGE_CODE: 'he',
  REGION_CODE: DEFAULT_FORMATTING_COUNTRY_CODE.toLowerCase(),
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
