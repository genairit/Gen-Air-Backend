import {
  TASK_STATUS_VALUES,
  type TaskStatusType,
} from '../constants/task-status.constant';

import { IsNotEmpty, IsIn } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsNotEmpty() @IsIn(TASK_STATUS_VALUES) declare status: TaskStatusType;
}
