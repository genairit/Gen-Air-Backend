import {
  Table,
  Model,
  Column,
  Default,
  DataType,
  CreatedAt,
  PrimaryKey,
} from 'sequelize-typescript';

import type { IExecutionPlanTemplate } from '../interfaces/execution-plan.interface';

@Table({ tableName: 'execution_plan_checklist_templates', updatedAt: false })
export class ExecutionPlanTemplate
  extends Model<
    IExecutionPlanTemplate,
    Omit<IExecutionPlanTemplate, 'id' | 'createdAt'>
  >
  implements IExecutionPlanTemplate
{
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare version: number;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare items: IExecutionPlanTemplate['items'];

  @CreatedAt
  declare createdAt: Date;
}
