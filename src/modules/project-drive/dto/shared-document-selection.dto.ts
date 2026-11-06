import {
  Matches,
  IsString,
  MaxLength,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { GOOGLE_DRIVE_ID_PATTERN } from '@Constants/google-drive.constant';

export class SharedDocumentSelectionDto {
  @ValidateIf((_object, fileId: unknown) => fileId !== null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LENGTHS.DRIVE_ID)
  @Matches(GOOGLE_DRIVE_ID_PATTERN)
  declare fileId: string | null;
}
