import Decimal from 'decimal.js';

export const ENGINEERING_QUANTITY_RULES_VERSION = '2026-11-22.v1';

export const ESTIMATE_ACCESSORY = {
  installationControl: 'IN-TH',
  thermostat: 'TH-01',
  remote: 'RC-01',
  branch: 'BR-01',
  pipe: 'IN-PI',
  shelterGrille: 'IN-GM',
  manifold: 'DU-MR',
} as const;

const DUCT_ALLOWANCE = 1.3;
const DUCT_METRES_PER_BEND = 1;

interface IEngineeringMeasurements {
  shelterSupply: boolean;
  pipeMetresIncludingRise: number;
  equipment:
    | 'mini-central'
    | 'vrf-wall'
    | 'vrf-concealed'
    | 'vrf-cassette'
    | 'vrf-outdoor'
    | 'other';
  distribution:
    | { kind: 'none' | 'manifold' }
    | { kind: 'duct'; catalogueCode: string; metres: number; bends: number };
}

interface IDerivedQuantity {
  quantity: number;
  catalogueCode: string;
}

const accessoryCodes: Record<
  IEngineeringMeasurements['equipment'],
  readonly string[]
> = {
  'mini-central': [ESTIMATE_ACCESSORY.installationControl],
  'vrf-wall': [ESTIMATE_ACCESSORY.remote],
  'vrf-concealed': [
    ESTIMATE_ACCESSORY.thermostat,
    ESTIMATE_ACCESSORY.installationControl,
  ],
  'vrf-cassette': [
    ESTIMATE_ACCESSORY.thermostat,
    ESTIMATE_ACCESSORY.installationControl,
  ],
  'vrf-outdoor': [ESTIMATE_ACCESSORY.branch],
  other: [],
};

const requireMeasurement = (value: number): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Measurement must be finite and non-negative');
  }
};

export const deriveEquipmentQuantities = ({
  equipment,
  pipeMetresIncludingRise,
  shelterSupply,
  distribution,
}: IEngineeringMeasurements): IDerivedQuantity[] => {
  requireMeasurement(pipeMetresIncludingRise);

  const pipeMetres = Math.ceil(pipeMetresIncludingRise);
  const quantities = accessoryCodes[equipment].map(
    (catalogueCode): IDerivedQuantity => ({ catalogueCode, quantity: 1 }),
  );
  if (pipeMetres > 0) {
    quantities.push({
      catalogueCode: ESTIMATE_ACCESSORY.pipe,
      quantity: pipeMetres,
    });
  }

  if (shelterSupply) {
    quantities.push({
      catalogueCode: ESTIMATE_ACCESSORY.shelterGrille,
      quantity: 2,
    });
  }

  if (distribution.kind === 'manifold') {
    quantities.push({
      catalogueCode: ESTIMATE_ACCESSORY.manifold,
      quantity: 1,
    });
  }

  if (distribution.kind === 'duct') {
    requireMeasurement(distribution.metres);
    if (!Number.isSafeInteger(distribution.bends) || distribution.bends < 0) {
      throw new RangeError('Duct bend count must be a non-negative integer');
    }

    const metres = new Decimal(distribution.metres)
      .times(DUCT_ALLOWANCE)
      .plus(distribution.bends * DUCT_METRES_PER_BEND);
    if (metres.gt(0)) {
      quantities.push({
        catalogueCode: distribution.catalogueCode,
        quantity: metres.toNumber(),
      });
    }
  }

  return quantities;
};
