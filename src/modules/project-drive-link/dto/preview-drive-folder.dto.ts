import {
  IsUUID,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

import { DRIVE_FOLDER_LINK } from '../constants/drive-folder-link.constant';

export class PreviewDriveFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(DRIVE_FOLDER_LINK.MAX_REFERENCE_LENGTH)
  declare reference: string;

  @IsOptional()
  @IsUUID()
  declare buildingId?: string;
}
