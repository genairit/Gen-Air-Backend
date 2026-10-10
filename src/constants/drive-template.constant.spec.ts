import { DRIVE_TEMPLATE_FOLDER_NAME_PATTERN } from './drive-template.constant';

describe('DRIVE_TEMPLATE_FOLDER_NAME_PATTERN', () => {
  it.each([
    '01_הנדסה_ותכנון',
    '{Project_ID}_{Project_Name}',
    'תיק_{Project_ID}',
  ])('accepts %s', (name) => {
    expect(DRIVE_TEMPLATE_FOLDER_NAME_PATTERN.test(name)).toBe(true);
  });

  it.each(['דירה_{Unit_Number}', '{Project_ID', 'Project_ID}', '{}'])(
    'rejects %s',
    (name) => {
      expect(DRIVE_TEMPLATE_FOLDER_NAME_PATTERN.test(name)).toBe(false);
    },
  );
});
