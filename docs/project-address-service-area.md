# Project address service area

Project addresses must still be selected from Google Places suggestions and verified on the server. Google is authoritative for the selected place identity, formatted address, locality and country component; typed client text does not establish validity.

The supported Google country codes are `IL` and `PS`, defined once in `src/constants/google-places.constant.ts`. Autocomplete derives its included region codes from that same allowlist, and address verification checks the country returned by Google against it. Hebrew remains the requested language and `il` remains the default formatting region.

This operational allowlist prevents a place such as Almon/Anatot from being rejected solely because a provider response classifies it under `PS`. The regression fixtures exercise that response shape; they do not assert that a live Google lookup was performed or establish a geopolitical classification. The country-code allowlist is not a precise geographic boundary or a locality-by-locality geofence.

Unknown, empty and other country codes remain rejected. A missing place, provider configuration failure, quota failure or other provider error is not silently accepted. Private-client projects still require a locality; company and institution rules are unchanged. Project persistence continues to resolve the place on the server rather than trusting a client-supplied address or country.

This is an application-logic change. No database migration, data backfill, environment variable or stored-address rewrite is needed.

Provider references:

- [Places autocomplete: included region codes](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete#includedRegionCodes)
- [Place address components](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places#AddressComponent)
- [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id)
