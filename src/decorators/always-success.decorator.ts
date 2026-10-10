import { SetMetadata } from '@nestjs/common';
import { METADATA_KEYS } from '../constants/metadata-keys';

export interface AlwaysSucceedOptions {
  status: number;
}

export const AlwaysSucceed = (options: AlwaysSucceedOptions) => {
  return SetMetadata(METADATA_KEYS.ALWAYS_SUCCEED, options);
};
