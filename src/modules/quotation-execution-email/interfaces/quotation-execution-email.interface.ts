import { QuotationEmailStatusType } from '../constants/quotation-execution-email.constant';

export interface IQuotationExecutionEmail {
  id: string;
  body: string;
  taskId: string;
  subject: string;
  createdAt: Date;
  updatedAt: Date;
  requestId: string;
  zipFileId: string;
  planFileId: string;
  planVersion: string;
  senderUserId: string;
  errorCode: string | null;
  recipientEmails: string[];
  architectContactId: string;
  recipientContactIds: string[];
  status: QuotationEmailStatusType;
  providerMessageId: string | null;
}

export type TQuotationExecutionEmailCreation = Omit<
  IQuotationExecutionEmail,
  'id' | 'createdAt' | 'updatedAt'
>;

export type TQuotationExecutionEmailUpdate = Partial<
  Pick<
    IQuotationExecutionEmail,
    | 'requestId'
    | 'senderUserId'
    | 'architectContactId'
    | 'planFileId'
    | 'zipFileId'
    | 'planVersion'
    | 'recipientContactIds'
    | 'recipientEmails'
    | 'subject'
    | 'body'
    | 'status'
    | 'providerMessageId'
    | 'errorCode'
  >
>;
