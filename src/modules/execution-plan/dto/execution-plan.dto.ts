import {
  IsIn,
  IsInt,
  IsUUID,
  IsArray,
  IsString,
  MaxLength,
  IsOptional,
  ArrayUnique,
} from 'class-validator';

import {
  EXECUTION_PLAN_DECISION,
  type ExecutionPlanDecisionType,
} from '../constants/execution-plan.constant';

export class CreateExecutionPlanDto {
  @IsUUID() declare quotationId: string;
  @IsUUID() declare projectId: string;
  @IsString() @MaxLength(200) declare driveFileId: string;
  @IsString() @MaxLength(100) declare planVersion: string;
  @IsOptional() @IsUUID() declare supersedesId?: string;
}

export class UpdateExecutionPlanChecklistDto {
  @IsInt() declare revision: number;
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  declare confirmedKeys: string[];
}

export class ExecutionPlanRevisionDto {
  @IsInt() declare revision: number;
}

export class DecideExecutionPlanDto extends ExecutionPlanRevisionDto {
  @IsIn(Object.values(EXECUTION_PLAN_DECISION))
  declare decision: ExecutionPlanDecisionType;
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  declare comment?: string;
}
