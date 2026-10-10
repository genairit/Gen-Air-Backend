import { decodeUploadedFileName } from './upload.utility';

describe('decodeUploadedFileName', () => {
  it('restores a Hebrew file name that multer decoded as latin1', () => {
    const latin1Name = Buffer.from('חישוב_עומסים.xlsx', 'utf8').toString(
      'latin1',
    );

    expect(decodeUploadedFileName(latin1Name)).toBe('חישוב_עומסים.xlsx');
  });

  it('keeps plain ASCII names unchanged', () => {
    expect(decodeUploadedFileName('plan_v2.pdf')).toBe('plan_v2.pdf');
  });
});
