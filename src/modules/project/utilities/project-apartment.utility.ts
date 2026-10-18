import { PROJECT_CODE } from '../constants/project-code.constant';
import { APARTMENT } from '../constants/project-apartment.constant';

export const formatApartmentCode = (
  buildingCode: string,
  sequence: number,
): string => {
  const paddedSequence = sequence
    .toString()
    .padStart(APARTMENT.CODE_SEQUENCE_DIGITS, '0');

  return `${buildingCode}${PROJECT_CODE.SEPARATOR}${paddedSequence}`;
};

export const formatApartmentName = (apartmentNumber: string): string =>
  `${APARTMENT.NAME_PREFIX} ${apartmentNumber}`;
