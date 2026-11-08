import {
  NotFoundException,
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { Test } from '@nestjs/testing';
import { AddressService } from './address.service';
import { toPlaceAddress } from '@Utilities/google-places.utility';
import { IPlaceAddress } from '@Interfaces/google-places.interface';
import { PARAN_JERUSALEM_PLACE } from './testing/paran-jerusalem.fixture';
import { GooglePlacesService } from '@Providers/google-places/google-places.service';

const LOOKUP = { placeId: 'ChIJ1', sessionToken: null };

const ISRAELI_ADDRESS: IPlaceAddress = {
  placeId: 'ChIJ1',
  countryCode: 'IL',
  city: 'תל אביב-יפו',
  formattedAddress: 'הרצל 1, תל אביב-יפו, ישראל',
};

const createService = async (overrides: Partial<GooglePlacesService> = {}) => {
  const googlePlacesService = {
    isConfigured: jest.fn().mockReturnValue(true),
    getSuggestions: jest.fn().mockResolvedValue([]),
    findPlace: jest.fn().mockResolvedValue(ISRAELI_ADDRESS),
    ...overrides,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      AddressService,
      { provide: GooglePlacesService, useValue: googlePlacesService },
    ],
  }).compile();

  return { service: moduleRef.get(AddressService), googlePlacesService };
};

describe('AddressService.getSuggestions', () => {
  it('returns the suggestions Google Places found', async () => {
    const suggestions = [
      { placeId: 'ChIJ1', mainText: 'הרצל 1', secondaryText: 'תל אביב-יפו' },
    ];
    const { service } = await createService({
      getSuggestions: jest.fn().mockResolvedValue(suggestions),
    });

    await expect(
      service.getSuggestions({ input: 'הרצל', sessionToken: null }),
    ).resolves.toEqual(suggestions);
  });

  it('answers 503 when Google Places is not configured', async () => {
    const { service, googlePlacesService } = await createService({
      isConfigured: jest.fn().mockReturnValue(false),
    });

    await expect(
      service.getSuggestions({ input: 'הרצל', sessionToken: null }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(googlePlacesService.getSuggestions).not.toHaveBeenCalled();
  });

  it('answers 502 when Google Places fails', async () => {
    const { service } = await createService({
      getSuggestions: jest.fn().mockRejectedValue(new Error('quota exceeded')),
    });

    await expect(
      service.getSuggestions({ input: 'הרצל', sessionToken: null }),
    ).rejects.toThrow(BadGatewayException);
  });
});

describe('AddressService.getVerifiedAddress', () => {
  it('accepts the provider-verified Paran 1 address despite its missing country component', async () => {
    const address = toPlaceAddress(PARAN_JERUSALEM_PLACE);
    const { service } = await createService({
      findPlace: jest.fn().mockResolvedValue(address),
    });

    await expect(service.getVerifiedAddress(LOOKUP)).resolves.toEqual(address);
  });

  it('rejects a missing-country place outside Jerusalem coordinates', async () => {
    const address = toPlaceAddress(PARAN_JERUSALEM_PLACE);
    const { service } = await createService({
      findPlace: jest.fn().mockResolvedValue({
        ...address,
        location: { latitude: 40, longitude: 35.2299901 },
      }),
    });

    await expect(service.getVerifiedAddress(LOOKUP)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns an Israeli place as a verified address', async () => {
    const { service } = await createService();

    await expect(service.getVerifiedAddress(LOOKUP)).resolves.toEqual(
      ISRAELI_ADDRESS,
    );
  });

  it.each(['עלמון', 'ענתות'])(
    'accepts %s when Google classifies the selected place under PS',
    async (city) => {
      const address: IPlaceAddress = {
        ...ISRAELI_ADDRESS,
        city,
        countryCode: 'PS',
        formattedAddress: city,
      };
      const { service } = await createService({
        findPlace: jest.fn().mockResolvedValue(address),
      });

      await expect(service.getVerifiedAddress(LOOKUP)).resolves.toEqual(
        address,
      );
    },
  );

  it('rejects a place id Google does not know', async () => {
    const { service } = await createService({
      findPlace: jest.fn().mockResolvedValue(null),
    });

    await expect(service.getVerifiedAddress(LOOKUP)).rejects.toThrow(
      NotFoundException,
    );
  });

  it.each(['JO', 'EG', 'US', ''])(
    'rejects a place with unsupported country code %s',
    async (countryCode) => {
      const { service } = await createService({
        findPlace: jest
          .fn()
          .mockResolvedValue({ ...ISRAELI_ADDRESS, countryCode }),
      });

      await expect(service.getVerifiedAddress(LOOKUP)).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it('rejects a place with no country', async () => {
    const { service } = await createService({
      findPlace: jest
        .fn()
        .mockResolvedValue({ ...ISRAELI_ADDRESS, countryCode: null }),
    });

    await expect(service.getVerifiedAddress(LOOKUP)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('answers 503 when Google Places is not configured', async () => {
    const { service } = await createService({
      isConfigured: jest.fn().mockReturnValue(false),
    });

    await expect(service.getVerifiedAddress(LOOKUP)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('answers 502 when Google Places fails', async () => {
    const { service } = await createService({
      findPlace: jest.fn().mockRejectedValue(new Error('timeout')),
    });

    await expect(service.getVerifiedAddress(LOOKUP)).rejects.toThrow(
      BadGatewayException,
    );
  });
});
