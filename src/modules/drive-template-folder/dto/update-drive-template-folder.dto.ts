import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IsString, Matches, MaxLength, IsNotEmpty } from 'class-validator';
import { DRIVE_TEMPLATE_FOLDER_NAME_PATTERN } from '@Constants/drive-template.constant';

export class UpdateDriveTemplateFolderDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(FIELD_LENGTHS.FOLDER_NAME)
  @Matches(DRIVE_TEMPLATE_FOLDER_NAME_PATTERN, {
    message: 'name may only use the {Project_ID} and {Project_Name} tags',
  })
  declare name: string;
}
