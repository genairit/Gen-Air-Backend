import {
  toLogicalOrderLine,
  fixVisualOrderHebrew,
  isVisualOrderHebrewLine,
} from './hebrew-text.utility';

const reverse = (text: string): string => [...text].reverse().join('');

describe('Hebrew visual-order repair', () => {
  it.each([
    'הצעת מחיר למזגן מרכזי בבניין',
    'שלום עולם, זהו מסמך תכנון',
    'מנהל הפרויקט אישר את הלוח זמנים',
  ])('keeps a logical-order line unchanged: %s', (line) => {
    expect(isVisualOrderHebrewLine(line)).toBe(false);
    expect(fixVisualOrderHebrew(line)).toBe(line);
  });

  it.each([
    'הצעת מחיר למזגן מרכזי בבניין',
    'שלום עולם, זהו מסמך תכנון',
    'מנהל הפרויקט אישר את הלוח זמנים',
  ])('detects and restores a reversed line: %s', (line) => {
    const visualLine = reverse(line);

    expect(isVisualOrderHebrewLine(visualLine)).toBe(true);
    expect(fixVisualOrderHebrew(visualLine)).toBe(line);
  });

  it('keeps numbers, prices and Latin model names in reading order', () => {
    const visual = 'הנקתה ללוכ ₪ 12,500.50 אוה VRF-200 ןגזמה ריחמ';

    expect(isVisualOrderHebrewLine(visual)).toBe(true);
    expect(toLogicalOrderLine(visual)).toBe(
      'מחיר המזגן VRF-200 הוא 12,500.50 ₪ כולל התקנה',
    );
  });

  it('mirrors brackets that were stored as displayed glyphs', () => {
    expect(toLogicalOrderLine('(םולש)')).toBe('(שלום)');
  });

  it('repairs each line of a page independently', () => {
    const reversedLine = 'שלום עולם';
    const page = [reverse(reversedLine), 'Model ABC-12', 'הזמנה מספר 7'].join(
      '\n',
    );

    expect(fixVisualOrderHebrew(page)).toBe(
      [reversedLine, 'Model ABC-12', 'הזמנה מספר 7'].join('\n'),
    );
  });

  it('leaves lines without Hebrew evidence untouched', () => {
    expect(fixVisualOrderHebrew('Invoice 2026-11 total 100')).toBe(
      'Invoice 2026-11 total 100',
    );
    expect(fixVisualOrderHebrew('')).toBe('');
  });
});
