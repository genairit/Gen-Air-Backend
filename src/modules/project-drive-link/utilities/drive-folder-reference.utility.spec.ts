import { parseDriveFolderReference } from './drive-folder-reference.utility';
import { DRIVE_FOLDER_LINK_ERROR_CODES } from '../constants/drive-folder-link.constant';

const FOLDER_ID = 'legacy_Project-folder_123';
const VALID_REFERENCES = [
  FOLDER_ID,
  `  ${FOLDER_ID}  `,
  `https://drive.google.com/drive/folders/${FOLDER_ID}`,
  `https://drive.google.com/drive/u/0/folders/${FOLDER_ID}?usp=sharing`,
  `https://drive.google.com/drive/u/12/folders/${FOLDER_ID}/`,
];
const INVALID_REFERENCES = [
  '',
  ' ',
  '../company-root',
  'folder ID with spaces',
  `https://evil.example/drive/folders/${FOLDER_ID}`,
  `https://drive.google.com.evil.example/drive/folders/${FOLDER_ID}`,
  `https://drive.google.com@evil.example/drive/folders/${FOLDER_ID}`,
  `https://user:password@drive.google.com/drive/folders/${FOLDER_ID}`,
  `http://drive.google.com/drive/folders/${FOLDER_ID}`,
  `https://drive.google.com/file/d/${FOLDER_ID}/view`,
  `https://docs.google.com/document/d/${FOLDER_ID}`,
  `https://drive.google.com/drive/folders/${FOLDER_ID}/nested`,
  `javascript:alert('${FOLDER_ID}')`,
];

describe('Drive folder reference parsing', () => {
  it.each(VALID_REFERENCES)(
    'extracts only the folder ID from %s',
    (reference) => {
      expect(parseDriveFolderReference(reference)).toBe(FOLDER_ID);
    },
  );

  it.each(INVALID_REFERENCES)(
    'rejects a non-folder reference %s',
    (reference) => {
      expect(() => parseDriveFolderReference(reference)).toThrow();
      try {
        parseDriveFolderReference(reference);
      } catch (error) {
        expect(error).toMatchObject({
          response: { code: DRIVE_FOLDER_LINK_ERROR_CODES.INVALID_REFERENCE },
        });
      }
    },
  );
});
