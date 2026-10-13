import { TaskStatusType } from '../constants/task-status.constant';

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
  assigneeId: string | null;
  description: string | null;
}
export interface ITaskFilter {
  projectId: string | null;
  isUrgent: boolean | null;
  assigneeId: string | null;
  customerId: string | null;
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
export type TTaskUpdateAttributes = Partial<
  TTaskEditableAttributes & Pick<ITask, 'status' | 'isUrgent'>
>;
export interface ITaskUrgentEvent {
  taskId: string;
  projectId: string;
  customerId: string;
  changedById: string;
  assigneeId: string | null;
}
