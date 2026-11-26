import { deriveEquipmentQuantities } from './quantity-rules';

describe('Engineering estimate quantity rules', () => {
  it('rounds pipe per measured run, derives two shelter grilles, and excludes the manifold for sheet-metal duct', (): void => {
    expect(
      deriveEquipmentQuantities({
        equipment: 'vrf-concealed',
        pipeMetresIncludingRise: 5.2,
        shelterSupply: true,
        distribution: {
          kind: 'duct',
          catalogueCode: 'DU-SM',
          metres: 8.5,
          bends: 2,
        },
      }),
    ).toEqual([
      { catalogueCode: 'TH-01', quantity: 1 },
      { catalogueCode: 'IN-TH', quantity: 1 },
      { catalogueCode: 'IN-PI', quantity: 6 },
      { catalogueCode: 'IN-GM', quantity: 2 },
      { catalogueCode: 'DU-SM', quantity: 13.05 },
    ]);
  });

  it('calculates only confirmed manifold and branch quantities and rejects negative length', (): void => {
    expect(
      deriveEquipmentQuantities({
        equipment: 'vrf-outdoor',
        pipeMetresIncludingRise: 0,
        shelterSupply: false,
        distribution: { kind: 'manifold' },
      }),
    ).toEqual([
      { catalogueCode: 'BR-01', quantity: 1 },
      { catalogueCode: 'DU-MR', quantity: 1 },
    ]);
    expect((): unknown =>
      deriveEquipmentQuantities({
        equipment: 'other',
        pipeMetresIncludingRise: -1,
        shelterSupply: false,
        distribution: { kind: 'none' },
      }),
    ).toThrow(RangeError);
  });
});
