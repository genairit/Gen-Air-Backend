import {
  toPlaceAddress,
  toPlaceSuggestions,
  isPlaceNotFoundError,
  buildAutocompleteBody,
  buildPlaceDetailsParams,
} from './google-places.utility';

import { AxiosError, AxiosHeaders } from 'axios';

const SESSION_TOKEN = '2f1c8a5e-7b3d-4c1a-9e2f-6a8b0c4d2e1f';

const REQUEST_CONFIG = { headers: new AxiosHeaders() };

const buildAxiosError = (status: number): AxiosError =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', REQUEST_CONFIG, null, {
    status,
    data: {},
    headers: {},
    statusText: '',
    config: REQUEST_CONFIG,
  });

describe('buildAutocompleteBody', () => {
  it('restricts suggestions to Israel in Hebrew and passes the session token', () => {
    expect(
      buildAutocompleteBody({ input: 'הרצל 1', sessionToken: SESSION_TOKEN }),
    ).toEqual({
      input: 'הרצל 1',
      regionCode: 'il',
      languageCode: 'he',
      includedRegionCodes: ['il'],
      sessionToken: SESSION_TOKEN,
    });
  });

  it('omits a missing session token', () => {
    expect(
      buildAutocompleteBody({ input: 'הרצל 1', sessionToken: null }),
    ).not.toHaveProperty('sessionToken');
  });
});

describe('buildPlaceDetailsParams', () => {
  it('passes the session token so the pick closes the billing session', () => {
    expect(
      buildPlaceDetailsParams({
        placeId: 'ChIJ1',
        sessionToken: SESSION_TOKEN,
      }),
    ).toEqual({
      regionCode: 'il',
      languageCode: 'he',
      sessionToken: SESSION_TOKEN,
    });
  });

  it('omits a missing session token', () => {
    expect(
      buildPlaceDetailsParams({ placeId: 'ChIJ1', sessionToken: null }),
    ).not.toHaveProperty('sessionToken');
  });
});

describe('toPlaceSuggestions', () => {
  it('maps place predictions to street and city lines', () => {
    const response = {
      suggestions: [
        {
          placePrediction: {
            placeId: 'ChIJ1',
            text: { text: 'הרצל 1, תל אביב-יפו, ישראל' },
            structuredFormat: {
              mainText: { text: 'הרצל 1' },
              secondaryText: { text: 'תל אביב-יפו, ישראל' },
            },
          },
        },
      ],
    };

    expect(toPlaceSuggestions(response)).toEqual([
      {
        placeId: 'ChIJ1',
        mainText: 'הרצל 1',
        secondaryText: 'תל אביב-יפו, ישראל',
      },
    ]);
  });

  it('falls back to the full text when there is no structured format', () => {
    const response = {
      suggestions: [
        { placePrediction: { placeId: 'ChIJ2', text: { text: 'חיפה' } } },
      ],
    };

    expect(toPlaceSuggestions(response)).toEqual([
      { placeId: 'ChIJ2', mainText: 'חיפה', secondaryText: null },
    ]);
  });

  it('drops query predictions and predictions without a place id', () => {
    const response = {
      suggestions: [
        { queryPrediction: { text: { text: 'פיצה' } } },
        { placePrediction: { text: { text: 'ללא מזהה' } } },
      ],
    };

    expect(toPlaceSuggestions(response)).toEqual([]);
  });

  it('returns no suggestions for an empty or malformed response', () => {
    expect(toPlaceSuggestions({})).toEqual([]);
    expect(toPlaceSuggestions(null)).toEqual([]);
    expect(toPlaceSuggestions({ suggestions: 'none' })).toEqual([]);
  });
});

describe('toPlaceAddress', () => {
  it('extracts the formatted address, city and country', () => {
    const place = {
      id: 'ChIJ1',
      formattedAddress: 'הרצל 1, תל אביב-יפו, ישראל',
      addressComponents: [
        { longText: '1', shortText: '1', types: ['street_number'] },
        {
          longText: 'תל אביב-יפו',
          shortText: 'תל אביב-יפו',
          types: ['locality', 'political'],
        },
        { longText: 'ישראל', shortText: 'IL', types: ['country', 'political'] },
      ],
    };

    expect(toPlaceAddress(place)).toEqual({
      placeId: 'ChIJ1',
      countryCode: 'IL',
      city: 'תל אביב-יפו',
      formattedAddress: 'הרצל 1, תל אביב-יפו, ישראל',
    });
  });

  it('leaves the city empty when the place has no locality', () => {
    const place = {
      id: 'ChIJ3',
      formattedAddress: 'ישראל',
      addressComponents: [{ shortText: 'IL', types: ['country'] }],
    };

    expect(toPlaceAddress(place)).toEqual({
      city: null,
      placeId: 'ChIJ3',
      countryCode: 'IL',
      formattedAddress: 'ישראל',
    });
  });

  it('rejects a place without an id or formatted address', () => {
    expect(toPlaceAddress({ formattedAddress: 'הרצל 1' })).toBeNull();
    expect(toPlaceAddress({ id: 'ChIJ1' })).toBeNull();
    expect(toPlaceAddress(null)).toBeNull();
  });
});

describe('isPlaceNotFoundError', () => {
  it('treats Google not-found and invalid-id answers as an unknown place', () => {
    expect(isPlaceNotFoundError(buildAxiosError(404))).toBe(true);
    expect(isPlaceNotFoundError(buildAxiosError(400))).toBe(true);
  });

  it('does not hide authorization, quota or server failures', () => {
    expect(isPlaceNotFoundError(buildAxiosError(403))).toBe(false);
    expect(isPlaceNotFoundError(buildAxiosError(429))).toBe(false);
    expect(isPlaceNotFoundError(buildAxiosError(500))).toBe(false);
    expect(isPlaceNotFoundError(new Error('timeout'))).toBe(false);
  });
});
