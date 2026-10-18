import {
  formatApartmentCode,
  formatApartmentName,
} from './project-apartment.utility';

describe('formatApartmentCode', () => {
  it('adds a two-digit sequence to the building code', () => {
    expect(formatApartmentCode('GA-84811', 1)).toBe('GA-84811-01');
  });

  it('keeps all digits from the hundredth apartment on', () => {
    expect(formatApartmentCode('GA-84811', 100)).toBe('GA-84811-100');
  });
});

describe('formatApartmentName', () => {
  it('names the apartment by its number', () => {
    expect(formatApartmentName('12')).toBe('דירה 12');
  });
});
