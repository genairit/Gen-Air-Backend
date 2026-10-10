import { SetMetadata } from '@nestjs/common';
import { METADATA_KEYS } from '@Constants/metadata-keys';

export const Public = () => SetMetadata(METADATA_KEYS.IS_PUBLIC, true);
