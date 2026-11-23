export interface ITaskQuotationSummary {
  id: string;
  number: string;
  status: string;
  isPrimary: boolean;
}
export interface IQuotationTaskLink {
  title: string;
  taskId: string;
  isPrimary: boolean;
}
export interface ITaskContext {
  id: string;
  title: string;
  taskType: string;
  projectId: string | null;
  customerId: string | null;
}
