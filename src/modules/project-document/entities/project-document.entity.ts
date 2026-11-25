import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  type ProjectDocumentStatusType,
  PROJECT_DOCUMENT_STATUS_VALUES,
} from '../constants/project-document.constant';

import {
  IProjectDocument,
  TProjectDocumentWrite,
} from '../interfaces/project-document.interface';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { Project } from '@Modules/project/entities/project.entity';

@Table({ tableName: 'project_documents', timestamps: false })
export class ProjectDocument
  extends Model<IProjectDocument, TProjectDocumentWrite>
  implements IProjectDocument
{
  @PrimaryKey
  @ForeignKey(() => Project)
  @Column({ allowNull: false, type: DataType.UUID })
  declare projectId: string;

  @PrimaryKey
  @Column({ allowNull: false, type: DataType.STRING(FIELD_LENGTHS.DRIVE_ID) })
  declare fileId: string;

  @Column(DataType.DATE)
  declare driveModifiedTime: Date | null;

  @Column(DataType.STRING(FIELD_LENGTHS.MD5_CHECKSUM))
  declare md5Checksum: string | null;

  @Column({ allowNull: false, type: DataType.INTEGER })
  declare pageCount: number;

  @Column({
    allowNull: false,
    type: DataType.ENUM(...PROJECT_DOCUMENT_STATUS_VALUES),
  })
  declare status: ProjectDocumentStatusType;

  @Default(DataType.NOW)
  @Column({ allowNull: false, type: DataType.DATE })
  declare indexedAt: Date;
}
