import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { GOOGLE_DRIVE_ID_PATTERN } from '@Constants/google-drive.constant';
import { Matches, IsString, MaxLength, IsOptional } from 'class-validator';

export class DriveFolderDto {
  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LENGTHS.DRIVE_ID)
  @Matches(GOOGLE_DRIVE_ID_PATTERN, { message: 'folderId is not a Drive id' })
  declare folderId?: string;
}
