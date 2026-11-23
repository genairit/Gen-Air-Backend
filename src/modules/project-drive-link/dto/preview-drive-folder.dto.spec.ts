import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PreviewDriveFolderDto } from './preview-drive-folder.dto';
import { CreateProjectDto } from '@Modules/project/dto/create-project.dto';
import { DRIVE_FOLDER_LINK } from '../constants/drive-folder-link.constant';
import { CreateApartmentDto } from '@Modules/project/dto/create-apartment.dto';

const UUID = '11111111-1111-4111-8111-111111111111';
const PROJECT_INPUT = {
  name: 'פרויקט בדיקה',
  customerId: UUID,
  projectTypeId: UUID,
  members: [],
};
const APARTMENT_INPUT = {
  customerId: UUID,
  customerFloor: 1,
  customerApartment: '101',
};
const FOLDER_REFERENCE = 'https://drive.google.com/drive/folders/legacy-folder';
const INVALID_FIELDS = [
  '',
  123,
  {},
  'a'.repeat(DRIVE_FOLDER_LINK.MAX_REFERENCE_LENGTH + 1),
];

describe('existing Drive folder DTO contracts', () => {
  it('accepts folder reference with an optional valid building ID for read-only preview', async () => {
    expect(
      await validate(
        plainToInstance(PreviewDriveFolderDto, { reference: FOLDER_REFERENCE }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(PreviewDriveFolderDto, {
          reference: FOLDER_REFERENCE,
          buildingId: UUID,
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(PreviewDriveFolderDto, {
          reference: FOLDER_REFERENCE,
          buildingId: 'not-a-uuid',
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(PreviewDriveFolderDto, {})),
    ).not.toHaveLength(0);
  });

  it.each(INVALID_FIELDS)(
    'rejects invalid preview references %p',
    async (reference) => {
      const errors = await validate(
        plainToInstance(PreviewDriveFolderDto, { reference }),
      );
      expect(errors.some((error) => error.property === 'reference')).toBe(true);
    },
  );

  it('keeps default project and apartment creation valid without an existing folder', async () => {
    expect(
      await validate(plainToInstance(CreateProjectDto, PROJECT_INPUT)),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(CreateApartmentDto, APARTMENT_INPUT)),
    ).toHaveLength(0);
  });

  it('accepts an optional existing folder in both creation contracts', async () => {
    expect(
      await validate(
        plainToInstance(CreateProjectDto, {
          ...PROJECT_INPUT,
          existingDriveFolder: FOLDER_REFERENCE,
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(CreateApartmentDto, {
          ...APARTMENT_INPUT,
          existingDriveFolder: FOLDER_REFERENCE,
        }),
      ),
    ).toHaveLength(0);
  });

  it.each(INVALID_FIELDS)(
    'rejects invalid project/apartment existing-folder values %p',
    async (existingDriveFolder) => {
      const project = await validate(
        plainToInstance(CreateProjectDto, {
          ...PROJECT_INPUT,
          existingDriveFolder,
        }),
      );
      const apartment = await validate(
        plainToInstance(CreateApartmentDto, {
          ...APARTMENT_INPUT,
          existingDriveFolder,
        }),
      );
      expect(
        project.some((error) => error.property === 'existingDriveFolder'),
      ).toBe(true);
      expect(
        apartment.some((error) => error.property === 'existingDriveFolder'),
      ).toBe(true);
    },
  );
});
