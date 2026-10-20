import { IsUUID, Matches, MaxLength } from 'class-validator';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { GOOGLE_DRIVE_ID_PATTERN } from '@Constants/google-drive.constant';

export class DriveFileParamsDto {
  @IsUUID()
  declare projectId: string;

  @MaxLength(FIELD_LENGTHS.DRIVE_ID)
  @Matches(GOOGLE_DRIVE_ID_PATTERN)
  declare fileId: string;
}
