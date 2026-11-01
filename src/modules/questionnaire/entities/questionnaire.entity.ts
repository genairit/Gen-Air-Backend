import {
  Table,
  Model,
  Column,
  DataType,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  IQuestionnaire,
  IQuestionnaireField,
} from '../interfaces/questionnaire.interface';

@Table({
  tableName: 'questionnaires',
  indexes: [
    {
      name: 'uq_questionnaires_slug_version',
      unique: true,
      fields: ['slug', 'version'],
    },
  ],
})
export class Questionnaire
  extends Model<IQuestionnaire>
  implements IQuestionnaire
{
  @PrimaryKey @Column(DataType.UUID) declare id: string;
  @Column({ type: DataType.STRING(120), allowNull: false })
  declare slug: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) declare version: number;
  @Column({ type: DataType.TEXT, allowNull: false }) declare title: string;
  @Column({ type: DataType.TEXT, allowNull: false })
  declare introduction: string;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare definition: IQuestionnaireField[];
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare acceptingResponses: boolean;
  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;
}
