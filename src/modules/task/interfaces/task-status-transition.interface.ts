import { IUser } from '@Modules/user/interfaces/user.interface';
import { TaskStatusType } from '../constants/task-status.constant';

export interface ITaskStatusTransition {
  id: string;
  taskId: string;
  createdAt: Date;
  changedBy?: IUser;
  changedById: string;
  toStatus: TaskStatusType;
  fromStatus: TaskStatusType | null;
}

export type TTaskStatusTransitionCreationAttributes = Pick<
  ITaskStatusTransition,
  'taskId' | 'fromStatus' | 'toStatus' | 'changedById'
>;
