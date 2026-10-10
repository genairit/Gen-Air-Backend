import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  IDriveTemplateFolder,
  TDriveTemplateFolderCreationAttributes,
} from '../interfaces/drive-template-folder.interface';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';

@Table({ tableName: 'drive_template_folders' })
export class DriveTemplateFolder
  extends Model<IDriveTemplateFolder, TDriveTemplateFolderCreationAttributes>
  implements IDriveTemplateFolder
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => DriveTemplateFolder)
  @Column(DataType.UUID)
  declare parentId: string | null;

  @Column({
    allowNull: false,
    type: DataType.STRING(FIELD_LENGTHS.FOLDER_NAME),
  })
  declare name: string;

  @Column({ allowNull: false, type: DataType.INTEGER })
  declare position: number;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
