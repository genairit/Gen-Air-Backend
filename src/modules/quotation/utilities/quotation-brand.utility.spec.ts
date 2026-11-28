import { SYSTEM_TYPE } from '../constants/quotation.constant';
import type { SaveQuotationDto } from '../dto/save-quotation.dto';
import { resolveQuotationBrandGroups } from './quotation-brand.utility';

const input = (changes: Partial<SaveQuotationDto> = {}): SaveQuotationDto =>
  ({
    brand: 'אלקטרה',
    brands: ['אלקטרה', 'תדיראן'],
    sections: [
      { id: 'a', title: '', systemType: 'VRF', brand: 'אלקטרה', items: [] },
      { id: 'b', title: '', systemType: 'VRF', brand: 'תדיראן', items: [] },
      {
        id: 'g',
        title: '',
        systemType: SYSTEM_TYPE.GENERAL,
        brand: null,
        items: [],
      },
    ],
    ...changes,
  }) as SaveQuotationDto;

describe('quotation brand groups', () => {
  it('keeps brand sections and the General catalogue section distinct', () => {
    const result = resolveQuotationBrandGroups(input());
    expect(result.brands).toEqual(['אלקטרה', 'תדיראן']);
    expect(result.sections.map((section) => section.brand)).toEqual([
      'אלקטרה',
      'תדיראן',
      null,
    ]);
  });

  it('stores sections in tab order while keeping order within each brand', () => {
    const source = input();
    const result = resolveQuotationBrandGroups({
      ...source,
      sections: [source.sections[2], source.sections[0], source.sections[1]],
    });
    expect(result.sections.map((section) => section.id)).toEqual([
      'a',
      'b',
      'g',
    ]);
  });

  it('validates complete floor pairs and canonicalizes UUID case before assigning headings', () => {
    const original = input();
    const floorId = 'ae000000-0000-4000-8000-000000000001';
    const floor = { floorId, floorName: 'Hall' };
    const withFloor = { ...original.sections[0], ...floor };
    const sameFloor = {
      ...original.sections[1],
      ...floor,
      floorId: floorId.toUpperCase(),
    };
    const resolve = (sections: SaveQuotationDto['sections']) =>
      resolveQuotationBrandGroups({ ...original, sections });
    expect(
      resolve([sameFloor, withFloor]).sections.map(
        (section) => section.floorId,
      ),
    ).toEqual([floorId, floorId]);
    expect(() => resolve([{ ...withFloor, floorName: null }])).toThrow();
    expect(() => resolve([{ ...withFloor, floorName: '  ' }])).toThrow();
    expect(() => resolve([{ ...original.sections[2], ...floor }])).toThrow();
    expect(() =>
      resolve([withFloor, { ...sameFloor, floorName: 'Other' }]),
    ).toThrow();
    const cleared = resolveQuotationBrandGroups(
      {
        ...original,
        sections: [{ ...withFloor, floorId: null, floorName: null }],
      },
      [withFloor],
    );
    expect(cleared.sections[0]).toMatchObject({
      floorId: null,
      floorName: null,
    });
  });

  it('rejects duplicate, missing, and mismatched brands', () => {
    expect(() =>
      resolveQuotationBrandGroups(input({ brands: ['אלקטרה', 'אלקטרה'] })),
    ).toThrow();
    expect(() =>
      resolveQuotationBrandGroups(input({ brands: ['תדיראן'] })),
    ).toThrow();
    expect(() =>
      resolveQuotationBrandGroups(
        input({
          sections: [
            { id: 'a', title: '', systemType: 'VRF', brand: 'LG', items: [] },
          ],
        }),
      ),
    ).toThrow();
  });

  it('allows only general systems in General and maps old payloads to their legacy brand', () => {
    expect(() =>
      resolveQuotationBrandGroups(
        input({
          sections: [
            { id: 'a', title: '', systemType: 'VRF', brand: null, items: [] },
          ],
        }),
      ),
    ).toThrow();
    const legacyInput = input({
      sections: [{ id: 'a', title: '', systemType: 'VRF', items: [] }],
    });
    Reflect.deleteProperty(legacyInput, 'brands');
    const legacy = resolveQuotationBrandGroups(legacyInput);
    expect(legacy.brands).toEqual(['אלקטרה']);
    expect(legacy.sections[0].brand).toBe('אלקטרה');
  });
});
