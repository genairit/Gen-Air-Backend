import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ApartmentImportRowDto } from '../dto/apartment-import-row.dto';
import { readApartmentImportField } from './apartment-import-customer.utility';
import { APARTMENT_IMPORT_COLUMNS } from '../constants/apartment-import.constant';
import { APARTMENT_IMPORT_ROW } from '../constants/apartment-import-row.constant';
import { APARTMENT_OWNERSHIP_OPTIONS } from '../constants/apartment-commercial.constant';

export const prepareApartmentImportRow = async (
  cells: readonly string[],
): Promise<{ apartment: ApartmentImportRowDto | null; errors: string[] }> => {
  const floor = readApartmentImportField(cells, 'floor');
  const ownership = readApartmentImportField(cells, 'ownership');
  const credit = readApartmentImportField(cells, 'credit');
  const ownerValue =
    APARTMENT_OWNERSHIP_OPTIONS.find(({ label }) => label === ownership)
      ?.value ?? ownership;
  const apartment = plainToInstance(ApartmentImportRowDto, {
    customerFloor: APARTMENT_IMPORT_ROW.FLOOR_PATTERN.test(floor)
      ? Number(floor)
      : null,
    customerApartment: readApartmentImportField(cells, 'apartment'),
    apartmentOwnership: ownerValue || null,
    apartmentCredit: credit || null,
  });
  const failures = await validate(apartment);
  const errors = failures.map(({ property }) => {
    const key =
      Object.entries(APARTMENT_IMPORT_ROW.FIELD_KEYS).find(
        ([field]) => field === property,
      )?.[1] ?? property;
    const header =
      APARTMENT_IMPORT_COLUMNS.find((column) => column.key === key)?.header ??
      property;
    return `${header}: חסר ערך נדרש או שהערך אינו תקין`;
  });
  return { apartment: errors.length === 0 ? apartment : null, errors };
};
