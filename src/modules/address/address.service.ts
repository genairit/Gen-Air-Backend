import {
  Injectable,
  HttpException,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  GOOGLE_PLACES,
  JERUSALEM_SERVICE_AREA,
} from '@Constants/google-places.constant';

import {
  IPlaceSearch,
  IPlaceLookup,
  IPlaceAddress,
  IPlaceSuggestion,
} from '@Interfaces/google-places.interface';

import { Meta, TypedLogger } from '@Logger/logger.service';
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

    const isInServiceArea = GOOGLE_PLACES.SERVICE_COUNTRY_CODES.some(
      (countryCode) => countryCode === address.countryCode,
    );

    if (!isInServiceArea && !this.isVerifiedJerusalemAddress(address)) {
      throw new BadRequestException(
        'Selected place is outside the supported service area; choose another address',
      );
    }

    return address;
  }

  private isVerifiedJerusalemAddress(address: IPlaceAddress): boolean {
    const { location } = address;

    if (
      address.countryCode ||
      address.city !== JERUSALEM_SERVICE_AREA.CITY ||
      !location
    ) {
      return false;
    }

    const latitudeInCity =
      location.latitude >= JERUSALEM_SERVICE_AREA.MIN_LATITUDE &&
      location.latitude <= JERUSALEM_SERVICE_AREA.MAX_LATITUDE;
    const longitudeInCity =
      location.longitude >= JERUSALEM_SERVICE_AREA.MIN_LONGITUDE &&
      location.longitude <= JERUSALEM_SERVICE_AREA.MAX_LONGITUDE;

    return latitudeInCity && longitudeInCity;
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
