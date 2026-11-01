import { prepareApartmentImportRow } from './apartment-import-row.utility';
import { APARTMENT_OWNERSHIP } from '../constants/apartment-commercial.constant';
import { APARTMENT_IMPORT_COLUMNS } from '../constants/apartment-import.constant';

const cells = (values: Record<string, string>): string[] =>
  APARTMENT_IMPORT_COLUMNS.map(({ key }) => values[key] ?? '');

describe('apartment import row fields', () => {
  it('uses route building context and preserves apartment identifiers and exact decimal credit', async () => {
    const result = await prepareApartmentImportRow(
      cells({
        floor: '-1',
        apartment: '003א',
        ownership: 'רוכש',
        credit: '120.50',
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.apartment).toMatchObject({
      customerFloor: -1,
      customerApartment: '003א',
      apartmentOwnership: APARTMENT_OWNERSHIP.BUYER,
      apartmentCredit: '120.50',
    });
  });
  it('keeps blank credit and ownership unknown rather than inventing0 or a buyer', async () => {
    const result = await prepareApartmentImportRow(
      cells({ floor: '0', apartment: '1' }),
    );
    expect(result.apartment?.apartmentCredit).toBeNull();
    expect(result.apartment?.apartmentOwnership).toBeNull();
    expect(result.errors).toEqual([]);
  });
  it.each(['-1', '1.001', 'NaN', '1e3', '1,000', ''])(
    'handles credit value%s',
    async (credit) => {
      const result = await prepareApartmentImportRow(
        cells({ floor: '0', apartment: '1', credit }),
      );
      expect(result.errors.length).toBe(credit === '' ? 0 : 1);
    },
  );
  it.each(['', '1.5', '1000', '-1000', '1e2'])(
    'rejects invalid floor%s',
    async (floor) => {
      expect(
        (await prepareApartmentImportRow(cells({ floor, apartment: '1' })))
          .errors,
      ).toHaveLength(1);
    },
  );
  it.each(['', 'A12', '1-2', '12345678901'])(
    'rejects invalid apartment%s',
    async (apartment) => {
      expect(
        (await prepareApartmentImportRow(cells({ floor: '1', apartment })))
          .errors,
      ).toHaveLength(1);
    },
  );
  it('maps landowner and rejects unrecognized ownership', async () => {
    expect(
      (
        await prepareApartmentImportRow(
          cells({ floor: '1', apartment: '1', ownership: 'בעל קרקע בתמ״א' }),
        )
      ).apartment?.apartmentOwnership,
    ).toBe(APARTMENT_OWNERSHIP.LANDOWNER);
    expect(
      (
        await prepareApartmentImportRow(
          cells({ floor: '1', apartment: '1', ownership: 'unknown' }),
        )
      ).errors,
    ).toHaveLength(1);
  });
});
