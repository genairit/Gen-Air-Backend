import { JENNY_LIMITS } from '../constants/jenny.constant';
import { selectCitedSources } from './jenny-source.utility';
import { IJennySource } from '../interfaces/jenny.interface';

const source = (
  fileId: string,
  fileName: string,
  page: number | null,
): IJennySource => ({
  page,
  fileId,
  fileName,
  url: `https://drive.google.com/open?id=${fileId}`,
});

describe('selectCitedSources', () => {
  it('keeps only sources whose file the answer mentions', () => {
    const plan = source('plan', 'תוכנית קומה 1.pdf', null);
    const contract = source('contract', 'חוזה ספק.pdf', null);

    expect(
      selectCitedSources('ראי את הקובץ תוכנית קומה 1.pdf', [plan, contract]),
    ).toEqual([plan]);
  });

  it('accepts a distinctive file name cited without its extension', () => {
    const plan = source('plan', 'מפרט מזגנים.pdf', null);

    expect(selectCitedSources('לפי מפרט מזגנים, הדגם הוא X', [plan])).toEqual([
      plan,
    ]);
  });

  it('keeps cited pages, drops uncited pages and prefers page citations over the bare file', () => {
    const listed = source('plan', 'plan.pdf', null);
    const pageThree = source('plan', 'plan.pdf', 3);
    const pageThirteen = source('plan', 'plan.pdf', 13);

    expect(
      selectCitedSources('לפי plan.pdf עמוד 3, ההספק הוא 13 קילוואט', [
        listed,
        pageThree,
        pageThirteen,
        pageThree,
      ]),
    ).toEqual([pageThree]);
  });

  it('returns no sources when the answer cites nothing from the tools', () => {
    expect(
      selectCitedSources('לא מצאתי מידע על כך', [source('a', 'a.pdf', 1)]),
    ).toEqual([]);
  });

  it('caps the number of returned sources', () => {
    const sources = Array.from(
      { length: JENNY_LIMITS.MAX_SOURCES + 3 },
      (_value, index) => source(`file-${index}`, `file-${index}.pdf`, null),
    );
    const message = sources.map((item) => item.fileName).join(', ');

    expect(selectCitedSources(message, sources)).toHaveLength(
      JENNY_LIMITS.MAX_SOURCES,
    );
  });
});
