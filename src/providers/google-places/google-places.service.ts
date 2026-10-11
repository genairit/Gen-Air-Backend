import {
  toPlaceAddress,
  toPlaceSuggestions,
  isPlaceNotFoundError,
  buildAutocompleteBody,
  buildPlaceDetailsParams,
} from '@Utilities/google-places.utility';

import {
  IPlaceSearch,
  IPlaceLookup,
  IPlaceAddress,
  IPlaceSuggestion,
} from '@Interfaces/google-places.interface';

import axios from 'axios';
import { Injectable } from '@nestjs/common';
import { GOOGLE_PLACES } from '@Constants/google-places.constant';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';

@Injectable()
export class GooglePlacesService {
  private readonly client = axios.create({
    baseURL: GOOGLE_PLACES.BASE_URL,
    timeout: GOOGLE_PLACES.REQUEST_TIMEOUT_MS,
  });

  isConfigured(): boolean {
    return this.getApiKey() !== null;
  }

  async getSuggestions(search: IPlaceSearch): Promise<IPlaceSuggestion[]> {
    const { data } = await this.client.post<unknown>(
      GOOGLE_PLACES.AUTOCOMPLETE_PATH,
      buildAutocompleteBody(search),
      { headers: this.buildHeaders(GOOGLE_PLACES.SUGGESTION_FIELDS) },
    );

    return toPlaceSuggestions(data);
  }

  async findPlace(lookup: IPlaceLookup): Promise<IPlaceAddress | null> {
    try {
      const { data } = await this.client.get<unknown>(
        `/places/${encodeURIComponent(lookup.placeId)}`,
        {
          params: buildPlaceDetailsParams(lookup),
          headers: this.buildHeaders(GOOGLE_PLACES.PLACE_FIELDS),
        },
      );

      return toPlaceAddress(data);
    } catch (error) {
      if (isPlaceNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  private buildHeaders(fieldMask: string): Record<string, string> {
    return {
      [GOOGLE_PLACES.FIELD_MASK_HEADER]: fieldMask,
      [GOOGLE_PLACES.API_KEY_HEADER]: this.requireApiKey(),
    };
  }

  private getApiKey(): string | null {
    return EnvironmentManager.get('GOOGLE_PLACES_API_KEY') || null;
  }

  private requireApiKey(): string {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY is not configured');
    }

    return apiKey;
  }
}
