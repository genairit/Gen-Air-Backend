import {
  IPlaceAddress,
  IPlaceSuggestion,
} from '@Interfaces/google-places.interface';

import { PlaceIdDto } from './dto/place-id.dto';
import { AddressService } from './address.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RateLimit } from '@Decorators/rate-limit.decorator';
import { AddressSessionDto } from './dto/address-session.dto';
import { Get, Param, Query, Controller } from '@nestjs/common';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { ADDRESS_RATE_LIMITS } from './constants/address.constant';
import { GetAddressSuggestionsDto } from './dto/get-address-suggestions.dto';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@ApiTags('address')
@ApiBearerAuth()
@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Get('suggestions')
  @RateLimit(ADDRESS_RATE_LIMITS.SUGGESTION_REQUESTS)
  @RequirePermissions(PERMISSIONS.ADDRESSES_LOOKUP)
  getSuggestions(
    @Query() search: GetAddressSuggestionsDto,
  ): Promise<IPlaceSuggestion[]> {
    return this.addressService.getSuggestions({
      input: search.input,
      sessionToken: search.sessionToken ?? null,
    });
  }

  @Get('places/:placeId')
  @RateLimit(ADDRESS_RATE_LIMITS.PLACE_REQUESTS)
  @RequirePermissions(PERMISSIONS.ADDRESSES_LOOKUP)
  getVerifiedAddress(
    @Param() place: PlaceIdDto,
    @Query() session: AddressSessionDto,
  ): Promise<IPlaceAddress> {
    return this.addressService.getVerifiedAddress({
      placeId: place.placeId,
      sessionToken: session.sessionToken ?? null,
    });
  }
}
