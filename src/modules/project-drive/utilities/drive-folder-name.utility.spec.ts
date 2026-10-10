import { renderDriveFolderName } from './drive-folder-name.utility';
import { PROJECT_ROOT_FOLDER_NAME } from '../constants/project-drive.constant';

const PROJECT = { code: 'אכ-48213', name: 'מגדל פארק בבלי C' };

describe('renderDriveFolderName', () => {
  it('names the project root folder from its code and name', () => {
    expect(renderDriveFolderName(PROJECT_ROOT_FOLDER_NAME, PROJECT)).toBe(
      'אכ-48213_מגדל פארק בבלי C',
    );
  });

  it('replaces every occurrence of a tag', () => {
    expect(
      renderDriveFolderName('{Project_ID}/{Project_ID}_תיק', PROJECT),
    ).toBe('אכ-48213/אכ-48213_תיק');
  });

  it('leaves names without tags untouched', () => {
    expect(renderDriveFolderName('01_הנדסה_ותכנון', PROJECT)).toBe(
      '01_הנדסה_ותכנון',
    );
  });
});
