import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
} from 'sequelize-typescript';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { IProjectDocumentPage } from '../interfaces/project-document.interface';

@Table({ tableName: 'project_document_pages', timestamps: false })
export class ProjectDocumentPage
  extends Model<IProjectDocumentPage, IProjectDocumentPage>
  implements IProjectDocumentPage
{
  @PrimaryKey
  @Column({ allowNull: false, type: DataType.UUID })
  declare projectId: string;

  @PrimaryKey
  @Column({ allowNull: false, type: DataType.STRING(FIELD_LENGTHS.DRIVE_ID) })
  declare fileId: string;

  @PrimaryKey
  @Column({ allowNull: false, type: DataType.INTEGER })
  declare pageNumber: number;

  @Column({ allowNull: false, type: DataType.TEXT })
  declare text: string;
}
