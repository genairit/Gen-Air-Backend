export interface IPlaceSearch {
  input: string;
  sessionToken: string | null;
}

export interface IPlaceLookup {
  placeId: string;
  sessionToken: string | null;
}

export interface IPlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string | null;
}

export interface IPlaceAddress {
  placeId: string;
  city: string | null;
  formattedAddress: string;
  countryCode: string | null;
}
