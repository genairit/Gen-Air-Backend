import {
  GOOGLE_PLACES,
  GOOGLE_PLACES_COMPONENT_TYPES,
} from '@Constants/google-places.constant';

import {
  IPlaceSearch,
  IPlaceLookup,
  IPlaceAddress,
  IPlaceSuggestion,
} from '@Interfaces/google-places.interface';

import { isAxiosError } from 'axios';
import { HttpStatus } from '@nestjs/common';
import { isObject } from './object.utility';

type TAddressComponentText = 'longText' | 'shortText';

interface IAddressComponentQuery {
  type: string;
  text: TAddressComponentText;
}

const PLACE_NOT_FOUND_STATUSES: readonly number[] = [
  HttpStatus.NOT_FOUND,
  HttpStatus.BAD_REQUEST,
];

const readString = (value: unknown): string | null => {
  if (typeof value !== 'string' || value === '') {
    return null;
  }

  return value;
};

const readText = (value: unknown): string | null => {
  if (!isObject(value)) {
    return null;
  }

  return readString(value.text);
};

const readArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
};

const toPlaceSuggestion = (suggestion: unknown): IPlaceSuggestion | null => {
  if (!isObject(suggestion) || !isObject(suggestion.placePrediction)) {
    return null;
  }

  const prediction = suggestion.placePrediction;
  const structuredFormat = isObject(prediction.structuredFormat)
    ? prediction.structuredFormat
    : {};

  const placeId = readString(prediction.placeId);
  const mainText =
    readText(structuredFormat.mainText) ?? readText(prediction.text);

  if (!placeId || !mainText) {
    return null;
  }

  return {
    placeId,
    mainText,
    secondaryText: readText(structuredFormat.secondaryText),
  };
};

const hasComponentType = (component: unknown, type: string): boolean =>
  isObject(component) && readArray(component.types).includes(type);

const findComponentText = (
  components: unknown[],
  query: IAddressComponentQuery,
): string | null => {
  const component = components.find((candidate) =>
    hasComponentType(candidate, query.type),
  );

  if (!isObject(component)) {
    return null;
  }

  return readString(component[query.text]);
};

export const buildAutocompleteBody = (search: IPlaceSearch) => ({
  input: search.input,
  regionCode: GOOGLE_PLACES.REGION_CODE,
  languageCode: GOOGLE_PLACES.LANGUAGE_CODE,
  includedRegionCodes: [GOOGLE_PLACES.REGION_CODE],
  ...(search.sessionToken ? { sessionToken: search.sessionToken } : {}),
});

export const buildPlaceDetailsParams = (lookup: IPlaceLookup) => ({
  regionCode: GOOGLE_PLACES.REGION_CODE,
  languageCode: GOOGLE_PLACES.LANGUAGE_CODE,
  ...(lookup.sessionToken ? { sessionToken: lookup.sessionToken } : {}),
});

export const toPlaceSuggestions = (response: unknown): IPlaceSuggestion[] => {
  if (!isObject(response)) {
    return [];
  }

  return readArray(response.suggestions).flatMap(
    (suggestion) => toPlaceSuggestion(suggestion) ?? [],
  );
};

export const toPlaceAddress = (place: unknown): IPlaceAddress | null => {
  if (!isObject(place)) {
    return null;
  }

  const placeId = readString(place.id);
  const formattedAddress = readString(place.formattedAddress);
  const components = readArray(place.addressComponents);

  if (!placeId || !formattedAddress) {
    return null;
  }

  return {
    placeId,
    formattedAddress,
    city: findComponentText(components, {
      text: 'longText',
      type: GOOGLE_PLACES_COMPONENT_TYPES.CITY,
    }),
    countryCode: findComponentText(components, {
      text: 'shortText',
      type: GOOGLE_PLACES_COMPONENT_TYPES.COUNTRY,
    }),
  };
};

export const isPlaceNotFoundError = (error: unknown): boolean => {
  if (!isAxiosError(error) || !error.response) {
    return false;
  }

  return PLACE_NOT_FOUND_STATUSES.includes(error.response.status);
};
