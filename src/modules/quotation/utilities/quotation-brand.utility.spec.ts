import type { SaveQuotationDto } from '../dto/save-quotation.dto';
import { resolveQuotationBrandGroups } from './quotation-brand.utility';

const input = (changes: Partial<SaveQuotationDto> = {}): SaveQuotationDto =>
  ({
    brand: 'אלקטרה',
    brands: ['אלקטרה', 'תדיראן'],
    sections: [
      { id: 'a', title: '', systemType: 'VRF', brand: 'אלקטרה', items: [] },
      { id: 'b', title: '', systemType: 'VRF', brand: 'תדיראן', items: [] },
      { id: 'g', title: '', systemType: 'GEN', brand: null, items: [] },
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
    const legacy = resolveQuotationBrandGroups(
      input({
        brands: undefined,
        sections: [{ id: 'a', title: '', systemType: 'VRF', items: [] }],
      }),
    );
    expect(legacy.brands).toEqual(['אלקטרה']);
    expect(legacy.sections[0].brand).toBe('אלקטרה');
  });
});
