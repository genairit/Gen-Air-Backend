import {
  Injectable,
  HttpException,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  IPlaceSearch,
  IPlaceLookup,
  IPlaceAddress,
  IPlaceSuggestion,
} from '@Interfaces/google-places.interface';

import { Meta, TypedLogger } from '@Logger/logger.service';
import { GOOGLE_PLACES } from '@Constants/google-places.constant';
import { GooglePlacesService } from '@Providers/google-places/google-places.service';

@Injectable()
export class AddressService {
  private readonly logger = new TypedLogger<Meta>(AddressService.name);

  constructor(private readonly googlePlacesService: GooglePlacesService) {}

  async getSuggestions(search: IPlaceSearch): Promise<IPlaceSuggestion[]> {
    this.assertPlacesConfigured();

    return await this.callPlaces(() =>
      this.googlePlacesService.getSuggestions(search),
    );
  }

  async getVerifiedAddress(lookup: IPlaceLookup): Promise<IPlaceAddress> {
    this.assertPlacesConfigured();

    const address = await this.callPlaces(() =>
      this.googlePlacesService.findPlace(lookup),
    );

    if (!address) {
      throw new NotFoundException(`Place ${lookup.placeId} was not found`);
    }

    if (address.countryCode !== GOOGLE_PLACES.COUNTRY_CODE) {
      throw new BadRequestException(
        `Place ${lookup.placeId} is not in Israel; choose an Israeli address`,
      );
    }

    return address;
  }

  private assertPlacesConfigured(): void {
    if (!this.googlePlacesService.isConfigured()) {
      throw new ServiceUnavailableException('Google Places is not configured');
    }
  }

  private async callPlaces<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error({ error, message: 'Google Places request failed' });

      throw new BadGatewayException('Google Places request failed', {
        cause: error,
      });
    }
  }
}
