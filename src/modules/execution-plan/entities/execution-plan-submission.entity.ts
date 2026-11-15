import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  CreatedAt,
  UpdatedAt,
  BelongsTo,
  ForeignKey,
  PrimaryKey,
} from 'sequelize-typescript';

import type {
  TExecutionPlanCreation,
  IExecutionPlanSubmission,
} from '../interfaces/execution-plan.interface';

import { User } from '@Modules/user/entities/user.entity';
import { Project } from '@Modules/project/entities/project.entity';
import { Quotation } from '@Modules/quotation/entities/quotation.entity';

@Table({ tableName: 'execution_plan_submissions' })
export class ExecutionPlanSubmission
  extends Model<IExecutionPlanSubmission, TExecutionPlanCreation>
  implements IExecutionPlanSubmission
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Quotation)
  @Column({ type: DataType.UUID, allowNull: false })
  declare quotationId: string;

  @ForeignKey(() => Project)
  @Column({ type: DataType.UUID, allowNull: false })
  declare projectId: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare driveFileId: string;

  @Column({ type: DataType.STRING(40), allowNull: false })
  declare driveFileVersion: string;

  @Column({ type: DataType.STRING(500), allowNull: false })
  declare driveFileName: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare planVersion: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare templateVersion: number;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare checklist: IExecutionPlanSubmission['checklist'];

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare status: IExecutionPlanSubmission['status'];

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare revision: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare submittedById: string;

  @Column({ type: DataType.DATE, allowNull: true })
  declare submittedAt: Date | null;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true })
  declare reviewedById: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare reviewedAt: Date | null;

  @Column({ type: DataType.STRING(2000), allowNull: true })
  declare returnComment: string | null;

  @ForeignKey(() => ExecutionPlanSubmission)
  @Column({ type: DataType.UUID, allowNull: true })
  declare supersedesId: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BelongsTo(() => Quotation, 'quotationId')
  declare quotation?: Quotation;

  @BelongsTo(() => Project, 'projectId')
  declare project?: Project;

  @BelongsTo(() => User, 'submittedById')
  declare submitter?: User;

  @BelongsTo(() => User, 'reviewedById')
  declare reviewer?: User;
}
