import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  BelongsTo,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import { Project } from '@Modules/project/entities/project.entity';
import { CustomerContact } from '@Modules/customer-contact/entities/customer-contact.entity';

@Table({ tableName: 'project_contact_links', timestamps: true })
export class ProjectContactLink extends Model {
  @PrimaryKey
  @ForeignKey(() => Project)
  @Column(DataType.UUID)
  declare projectId: string;

  @PrimaryKey
  @ForeignKey(() => CustomerContact)
  @Column(DataType.UUID)
  declare contactId: string;

  @Column(DataType.STRING(60))
  declare role: string | null;

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare isPrimary: boolean;

  @BelongsTo(() => CustomerContact, 'contactId')
  declare contact?: CustomerContact;
}
