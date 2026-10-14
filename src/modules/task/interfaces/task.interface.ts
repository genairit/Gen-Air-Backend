import { IUser } from '@Modules/user/interfaces/user.interface';
import { TaskStatusType } from '../constants/task-status.constant';
import { IProject } from '@Modules/project/interfaces/project.interface';
import { ICustomer } from '@Modules/customer/interfaces/customer.interface';

export type TTaskProject = Pick<IProject, 'id' | 'code' | 'name'>;

export type TTaskCustomer = Pick<ICustomer, 'id' | 'name'>;

export interface ITask {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  isUrgent: boolean;
  customerId: string;
  createdById: string;
  dueDate: Date | null;
  status: TaskStatusType;
  deletedAt: Date | null;
  assignee?: IUser | null;
  createdBy?: IUser | null;
  assigneeId: string | null;
  description: string | null;
  urgencyMarkedAt: Date | null;
  project?: TTaskProject | null;
  urgencyMarkedBy?: IUser | null;
  customer?: TTaskCustomer | null;
  urgencyMarkedById: string | null;
}

export interface ITaskFilter {
  projectId: string | null;
  isUrgent: boolean | null;
  assigneeId: string | null;
  customerId: string | null;
  unassigned: boolean | null;
  status: TaskStatusType | null;
}
export type TTaskEditableAttributes = Pick<
  ITask,
  | 'title'
  | 'projectId'
  | 'customerId'
  | 'assigneeId'
  | 'description'
  | 'dueDate'
>;
export type TTaskCreationAttributes = TTaskEditableAttributes &
  Pick<ITask, 'createdById'>;
export type TTaskStateAttributes = Pick<
  ITask,
  'status' | 'isUrgent' | 'urgencyMarkedById' | 'urgencyMarkedAt'
>;
export type TTaskUpdateAttributes = Partial<
  TTaskEditableAttributes & TTaskStateAttributes
>;
export interface ITaskUrgentEvent {
  taskId: string;
  projectId: string;
  customerId: string;
  changedById: string;
  assigneeId: string | null;
}

export type TTaskStatusCounts = Record<TaskStatusType, number>;

export interface ITaskCounts {
  total: number;
  urgent: number;
  byStatus: TTaskStatusCounts;
}
export interface ITaskCountRow {
  count: number;
  isUrgent: boolean;
  status: TaskStatusType;
}
export interface ITaskCursor {
  id: string;
  isUrgent: boolean;
  dueDate: Date | null;
}
