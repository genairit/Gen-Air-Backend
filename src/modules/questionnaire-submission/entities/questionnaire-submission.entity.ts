import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  CreatedAt,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import {
  IQuestionnaireAnswer,
  IQuestionnaireSubmission,
  TQuestionnaireSubmissionCreation,
} from '../interfaces/questionnaire-submission.interface';

import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { Questionnaire } from '@Modules/questionnaire/entities/questionnaire.entity';

@Table({
  tableName: 'questionnaire_submissions',
  updatedAt: false,
  indexes: [
    {
      name: 'uq_questionnaire_submissions_request_id',
      unique: true,
      fields: ['request_id'],
    },
    {
      name: 'idx_questionnaire_submissions_questionnaire_id',
      fields: ['questionnaire_id'],
    },
  ],
})
export class QuestionnaireSubmission
  extends Model<IQuestionnaireSubmission, TQuestionnaireSubmissionCreation>
  implements IQuestionnaireSubmission
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @ForeignKey(() => Questionnaire)
  @Column({ type: DataType.UUID, allowNull: false })
  declare questionnaireId: string;
  @Column({ type: DataType.UUID, allowNull: false }) declare requestId: string;
  @Column({
    type: DataType.STRING(FIELD_LENGTHS.QUESTIONNAIRE_IDENTITY),
    allowNull: false,
  })
  declare fullName: string;
  @Column({
    type: DataType.STRING(FIELD_LENGTHS.QUESTIONNAIRE_IDENTITY),
    allowNull: false,
  })
  declare role: string;
  @Column({
    type: DataType.STRING(FIELD_LENGTHS.QUESTIONNAIRE_IDENTITY),
    allowNull: false,
  })
  declare department: string;
  @Column({ type: DataType.JSONB, allowNull: false })
  declare answers: IQuestionnaireAnswer[];
  @CreatedAt declare createdAt: Date;
}
