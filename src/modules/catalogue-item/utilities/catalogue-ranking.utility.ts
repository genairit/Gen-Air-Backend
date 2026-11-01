import type { ICatalogueItem } from '../interfaces/catalogue-item.interface';
import { SYSTEM_TYPE } from '@Modules/quotation/constants/quotation.constant';

export const isCompatible = (
  item: ICatalogueItem,
  systemType?: string,
): boolean => {
  if (!systemType || systemType === SYSTEM_TYPE.GENERAL) {
    return true;
  }
  if (!item.systemType) {
    return true;
  }
  return item.systemType === systemType;
};
