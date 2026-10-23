import { IUser } from '@Modules/user/interfaces/user.interface';
import { TaskStatusType } from '../constants/task-status.constant';
import { IProject } from '@Modules/project/interfaces/project.interface';
import { ICustomer } from '@Modules/customer/interfaces/customer.interface';

export type TTaskCustomer = Pick<ICustomer, 'id' | 'name'>;

export type TTaskParentProject = Pick<IProject, 'id' | 'code' | 'name'> & {
  customer?: TTaskCustomer | null;
};

export type TTaskProject = TTaskParentProject & {
  parentProject?: TTaskParentProject | null;
};

export interface ITask {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  isUrgent: boolean;
  createdById: string;
  dueDate: Date | null;
  status: TaskStatusType;
  deletedAt: Date | null;
  assignee?: IUser | null;
  projectId: string | null;
  createdBy?: IUser | null;
  customerId: string | null;
  assigneeId: string | null;
  description: string | null;
  urgencyMarkedAt: Date | null;
  project?: TTaskProject | null;
  urgencyMarkedBy?: IUser | null;
  customer?: TTaskCustomer | null;
  urgencyMarkedById: string | null;
}

export interface ITaskFilter {
  search: string | null;
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
  changedById: string;
  projectId: string | null;
  customerId: string | null;
  assigneeId: string | null;
}

export type TTaskLink = Pick<ITask, 'projectId' | 'customerId'>;

export type TTaskLinkInput = Partial<TTaskLink>;

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
