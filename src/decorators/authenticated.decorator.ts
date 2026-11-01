import { SetMetadata } from '@nestjs/common';
import { METADATA_KEYS } from '@Constants/metadata-keys';

export const Authenticated = () =>
  SetMetadata(METADATA_KEYS.AUTHENTICATED_ONLY, true);
