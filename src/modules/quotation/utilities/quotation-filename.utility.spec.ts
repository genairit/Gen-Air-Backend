import { quotationFilename } from './quotation-filename.utility';

type TFilenameContext = Parameters<typeof quotationFilename>[0];

const context = (
  changes: Partial<TFilenameContext> = {},
): TFilenameContext => ({
  quotationId: 'quotation-17',
  title: 'הצעת מחיר',
  number: 'Q-17',
  customerName: 'לקוח',
  projectName: 'מגדל הים',
  buildingName: null,
  apartmentNumber: null,
  brands: ['תדיראן', 'אלקטרה'],
  ...changes,
});

it('uses the exact six-field order and saved brand order', (): void => {
  expect(quotationFilename(context())).toBe(
    'הצעת מחיר - Q-17 - לקוח - מגדל הים - תדיראן + אלקטרה.pdf',
  );
});

it('retains the primary apartment name and adds its actual building and apartment number', (): void => {
  expect(
    quotationFilename(
      context({
        projectName: 'דירה 4',
        buildingName: 'מגדל הים',
        apartmentNumber: '4',
      }),
    ),
  ).toBe(
    'הצעת מחיר - Q-17 - לקוח - דירה 4 - בנין מגדל הים דירה 4 - תדיראן + אלקטרה.pdf',
  );
});

it('uses order document identity without changing the stored quotation number', (): void => {
  expect(
    quotationFilename(
      context({
        title: 'הזמנה',
        projectName: 'דירה 4',
        buildingName: 'מגדל הים',
        apartmentNumber: '4',
      }),
    ),
  ).toBe(
    'הזמנה - Q-17 - לקוח - דירה 4 - בנין מגדל הים דירה 4 - תדיראן + אלקטרה.pdf',
  );
});

it('omits absent project, apartment and brand segments without dangling separators', (): void => {
  expect(quotationFilename(context({ projectName: null, brands: [] }))).toBe(
    'הצעת מחיר - Q-17 - לקוח.pdf',
  );
});

it('preserves readable Unicode and strips unsafe characters before adding labels', (): void => {
  expect(
    quotationFilename(
      context({
        number: 'Q/17',
        customerName: 'אבי: כהן',
        projectName: '../מגדל\\ים',
        apartmentNumber: '4?',
        brands: ['LG|VRF', 'תדיראן*'],
      }),
    ),
  ).toBe('הצעת מחיר - Q 17 - אבי כהן - מגדל ים - דירה 4 - LG VRF + תדיראן.pdf');
});

it('preserves safe underscores and internal hyphens', (): void => {
  expect(
    quotationFilename(
      context({
        customerName: 'אבי_כהן',
        projectName: 'מגדל-ים_ב',
        brands: ['LG_VRF'],
      }),
    ),
  ).toBe('הצעת מחיר - Q-17 - אבי_כהן - מגדל-ים_ב - LG_VRF.pdf');
});

it.each([
  {
    buildingName: 'מגדל הים',
    apartmentNumber: null,
    expected: 'בנין מגדל הים',
  },
  { buildingName: null, apartmentNumber: '4', expected: 'דירה 4' },
  { buildingName: ' / ', apartmentNumber: '4', expected: 'דירה 4' },
  { buildingName: 'מגדל הים', apartmentNumber: '?', expected: 'בנין מגדל הים' },
])(
  'renders only meaningful building/apartment labels: $expected',
  ({ buildingName, apartmentNumber, expected }): void => {
    expect(
      quotationFilename(
        context({
          buildingName,
          apartmentNumber,
          projectName: null,
          brands: [],
        }),
      ),
    ).toBe(`הצעת מחיר - Q-17 - לקוח - ${expected}.pdf`);
  },
);

it('omits optional segments that contain only unsafe or invisible characters', (): void => {
  expect(
    quotationFilename(
      context({
        customerName: '\u202e\u0000',
        projectName: '.. / \\ ..',
        buildingName: '?\u2066',
        apartmentNumber: '*\n',
        brands: [' ', '\u202e', '?'],
      }),
    ),
  ).toBe('הצעת מחיר - Q-17.pdf');
});

it('normalizes NFC and removes normalized duplicate brands while preserving first order', (): void => {
  expect(
    quotationFilename(
      context({
        customerName: 'Cafe\u0301',
        projectName: null,
        brands: ['LG', 'Cafe\u0301', 'Café', ' LG ', 'תדיראן*', 'תדיראן'],
      }),
    ),
  ).toBe('הצעת מחיר - Q-17 - Café - LG + Café + תדיראן.pdf');
});

it('removes bidi controls and control characters without injecting them into the filename', (): void => {
  expect(
    quotationFilename(
      context({
        customerName: '\u202eאבי\u2066\tכהן\u2069',
        projectName: null,
        brands: [],
      }),
    ),
  ).toBe('הצעת מחיר - Q-17 - אבי כהן.pdf');
});

it('does not add a collision suffix to an untruncated filename', (): void => {
  expect(quotationFilename(context())).not.toContain('~');
});

it('caps long Unicode names at 240 UTF-8 bytes while preserving kind, number and a stable suffix', (): void => {
  const longContext = context({
    customerName: 'לקוח'.repeat(80),
    projectName: 'פרויקט'.repeat(80),
    buildingName: 'בנין'.repeat(80),
    apartmentNumber: '4',
    brands: ['תדיראן'.repeat(80)],
  });
  const first = quotationFilename(longContext);
  expect(Buffer.byteLength(first, 'utf8')).toBeLessThanOrEqual(240);
  expect(first).toMatch(/^הצעת מחיר - Q-17~[0-9a-f]{12}(?: - .+)?\.pdf$/u);
  expect(quotationFilename(longContext)).toBe(first);
  expect(first).not.toContain('\ufffd');
});

it('uses stable quotation identity and full optional context to distinguish shortened names', (): void => {
  const longContext = context({ customerName: 'א'.repeat(500) });
  const first = quotationFilename(longContext);
  const differentQuotation = quotationFilename({
    ...longContext,
    quotationId: 'quotation-18',
  });
  const differentTail = quotationFilename({
    ...longContext,
    customerName: `${longContext.customerName}ב`,
  });
  expect(differentQuotation).not.toBe(first);
  expect(differentTail).not.toBe(first);
});

it('truncates optional emoji text at complete grapheme boundaries', (): void => {
  const filename = quotationFilename(
    context({
      customerName: '👍🏽'.repeat(100),
      projectName: null,
      brands: [],
    }),
  );
  const customer =
    filename
      .split(' - ')
      .at(2)
      ?.replace(/\.pdf$/u, '') ?? '';
  expect(Buffer.byteLength(filename, 'utf8')).toBeLessThanOrEqual(240);
  expect(customer).toMatch(/^(?:👍🏽)*$/u);
  expect(filename).not.toContain('\ufffd');
});

it.each(['', ' / ', '\u202e\u0000'])(
  'rejects an empty or unusable required document number: %j',
  (number): void => {
    expect(() => quotationFilename(context({ number }))).toThrow();
  },
);

it('rejects an unusable document kind rather than fabricating a filename', (): void => {
  expect(() => quotationFilename(context({ title: ' / ' }))).toThrow();
});

it('rejects pathological required data that cannot fit without shortening the document identity', (): void => {
  expect(() =>
    quotationFilename(context({ number: 'Q'.repeat(250) })),
  ).toThrow();
});

it.each([165, 180, 190, 199, 203])(
  'omits compound optional fields rather than leaving labels or brand separators with a %i-byte document number',
  (numberLength): void => {
    const number = 'Q'.repeat(numberLength);
    const filename = quotationFilename(
      context({
        number,
        customerName: 'לקוח'.repeat(60),
        projectName: 'פרויקט'.repeat(60),
        buildingName: 'מגדל'.repeat(60),
        apartmentNumber: '44444',
        brands: ['LG', 'VRF'.repeat(60)],
      }),
    );
    const optionalSegments = filename
      .replace(/\.pdf$/u, '')
      .split(' - ')
      .slice(2);
    expect(Buffer.byteLength(filename, 'utf8')).toBeLessThanOrEqual(240);
    expect(filename).toContain(`הצעת מחיר - ${number}~`);
    for (const segment of optionalSegments) {
      expect([
        'ב',
        'בנ',
        'בני',
        'בנין',
        'ד',
        'די',
        'דיר',
        'דירה',
      ]).not.toContain(segment);
      expect(segment).not.toMatch(/^\+|\+$/u);
      expect(segment).not.toMatch(/(?:^| )דירה$/u);
    }
  },
);
