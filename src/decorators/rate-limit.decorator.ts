import { METADATA_KEYS } from '../constants/metadata-keys';
import { RateLimitGuard } from '../guards/rate-limit-guard';
import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

export const RateLimit = (maxRequests: number) => {
  return applyDecorators(
    SetMetadata(METADATA_KEYS.MAX_REQUESTS, maxRequests),
    UseGuards(RateLimitGuard),
  );
};
