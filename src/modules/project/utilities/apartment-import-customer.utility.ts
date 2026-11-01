import {
  APARTMENT_IMPORT_CUSTOMER_TYPES,
  APARTMENT_IMPORT_CUSTOMER_FIELDS,
  type ApartmentImportColumnKeyType,
  APARTMENT_IMPORT_CUSTOMER_COMPARISON,
  APARTMENT_IMPORT_CUSTOMER_COMPARISON_FIELDS,
} from '../constants/apartment-import-customer.constant';

import {
  IApartmentImportNewCustomer,
  IApartmentCustomerDeclaration,
  IApartmentImportCustomerIdentity,
  IApartmentCustomerDeclarationInput,
  IApartmentImportCustomerComparison,
} from '../interfaces/apartment-import-customer.interface';

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { isValidIsraeliCompanyNumber } from '@Utilities/israeli-id.utility';
import { CreateCustomerDto } from '@Modules/customer/dto/create-customer.dto';
import { APARTMENT_IMPORT_COLUMNS } from '../constants/apartment-import.constant';

export const readApartmentImportField = (
  cells: readonly string[],
  key: ApartmentImportColumnKeyType,
): string => {
  const index = APARTMENT_IMPORT_COLUMNS.findIndex(
    (column) => column.key === key,
  );
  return (cells[index] ?? '').trim();
};

export const readApartmentCustomerIdentity = (
  cells: readonly string[],
): IApartmentImportCustomerIdentity => {
  const taxId = readApartmentImportField(
    cells,
    APARTMENT_IMPORT_CUSTOMER_FIELDS.taxId,
  );
  if (!isValidIsraeliCompanyNumber(taxId)) {
    return {
      taxId: null,
      errors: [
        `${getImportFieldHeader(APARTMENT_IMPORT_CUSTOMER_FIELDS.taxId)}: נדרש מספר תקין בן 9 ספרות`,
      ],
    };
  }

  return { taxId, errors: [] };
};

export const prepareApartmentImportCustomer = async (
  cells: readonly string[],
): Promise<IApartmentImportNewCustomer> => {
  const values = Object.fromEntries(
    Object.entries(APARTMENT_IMPORT_CUSTOMER_FIELDS).map(([field, key]) => [
      field,
      readApartmentImportField(cells, key),
    ]),
  );
  const typeLabel = readApartmentImportField(
    cells,
    APARTMENT_IMPORT_CUSTOMER_FIELDS.customerType,
  );
  const customerType =
    APARTMENT_IMPORT_CUSTOMER_TYPES.find(({ label }) => label === typeLabel)
      ?.value ?? null;
  const customer = plainToInstance(CreateCustomerDto, {
    ...values,
    customerType,
  });
  const failures = await validate(customer);
  const errors = failures.map(({ property }) => {
    const field =
      Object.entries(APARTMENT_IMPORT_CUSTOMER_FIELDS).find(
        ([key]) => key === property,
      )?.[1] ?? null;
    const header = getImportFieldHeader(field ?? property);
    return `${header}: חסר ערך נדרש או שהערך אינו תקין`;
  });
  if (errors.length > 0) {
    return { customer: null, errors };
  }

  return { customer, errors: [] };
};

const getImportFieldHeader = (field: string): string =>
  APARTMENT_IMPORT_COLUMNS.find(({ key }) => key === field)?.header ?? field;

const CUSTOMER_FIELD_NORMALIZERS = {
  [APARTMENT_IMPORT_CUSTOMER_COMPARISON.TEXT]: (value: string): string =>
    value.trim(),
  [APARTMENT_IMPORT_CUSTOMER_COMPARISON.EMAIL]: (value: string): string =>
    value.trim().toLowerCase(),
  [APARTMENT_IMPORT_CUSTOMER_COMPARISON.PHONE]: (value: string): string =>
    value.trim().replace(/-/g, ''),
  [APARTMENT_IMPORT_CUSTOMER_COMPARISON.TYPE]: (value: string): string =>
    value.trim(),
};

export const compareApartmentImportCustomer = ({
  cells,
  customer,
}: IApartmentImportCustomerComparison): string[] => {
  const conflictingFields = APARTMENT_IMPORT_CUSTOMER_COMPARISON_FIELDS.filter(
    ({ field, mode }) => {
      const input = readApartmentImportField(
        cells,
        APARTMENT_IMPORT_CUSTOMER_FIELDS[field],
      );
      if (!input) {
        return false;
      }

      const normalizedInput = normalizeCustomerComparisonInput(input, mode);
      const normalizedStored = CUSTOMER_FIELD_NORMALIZERS[mode](
        customer[field],
      );
      return normalizedInput !== normalizedStored;
    },
  );
  return conflictingFields.map(
    ({ field }) =>
      `${getImportFieldHeader(APARTMENT_IMPORT_CUSTOMER_FIELDS[field])}: אינו תואם ללקוח הקיים`,
  );
};

const normalizeCustomerComparisonInput = (
  value: string,
  mode: (typeof APARTMENT_IMPORT_CUSTOMER_COMPARISON_FIELDS)[number]['mode'],
): string | null => {
  if (mode === APARTMENT_IMPORT_CUSTOMER_COMPARISON.TYPE) {
    return (
      APARTMENT_IMPORT_CUSTOMER_TYPES.find(({ label }) => label === value)
        ?.value ?? null
    );
  }

  return CUSTOMER_FIELD_NORMALIZERS[mode](value);
};

export const mergeApartmentCustomerDeclaration = ({
  cells,
  previous,
}: IApartmentCustomerDeclarationInput): IApartmentCustomerDeclaration => {
  const earlier = previous ?? [];
  const conflictingFields = APARTMENT_IMPORT_CUSTOMER_COMPARISON_FIELDS.filter(
    ({ field, mode }) => {
      const key = APARTMENT_IMPORT_CUSTOMER_FIELDS[field];
      const before = readApartmentImportField(earlier, key);
      const after = readApartmentImportField(cells, key);
      if (!before || !after) {
        return false;
      }

      const normalizedBefore =
        normalizeCustomerComparisonInput(before, mode) ?? before;
      const normalizedAfter =
        normalizeCustomerComparisonInput(after, mode) ?? after;
      return normalizedBefore !== normalizedAfter;
    },
  );
  if (conflictingFields.length > 0) {
    return {
      cells: [...earlier],
      errors: conflictingFields.map(
        ({ field }) =>
          `${getImportFieldHeader(APARTMENT_IMPORT_CUSTOMER_FIELDS[field])}: אינו תואם להצהרה קודמת בקובץ`,
      ),
    };
  }

  const merged = APARTMENT_IMPORT_COLUMNS.map(({ key }) => {
    const isIdentityField = APARTMENT_IMPORT_CUSTOMER_COMPARISON_FIELDS.some(
      ({ field }) => APARTMENT_IMPORT_CUSTOMER_FIELDS[field] === key,
    );
    if (!isIdentityField) {
      return '';
    }

    return (
      readApartmentImportField(earlier, key) ||
      readApartmentImportField(cells, key)
    );
  });
  return { cells: merged, errors: [] };
};
