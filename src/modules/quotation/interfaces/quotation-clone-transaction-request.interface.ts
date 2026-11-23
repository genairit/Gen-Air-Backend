import type { Transaction } from 'sequelize';
import type { CloneQuotationDto } from '../dto/clone-quotation.dto';
import type { IQuotationDocument } from './quotation-document.interface';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';

export interface IQuotationCloneTransactionRequest {
  id: string;
  actor: IAuthorizedUser;
  input: CloneQuotationDto;
  transaction: Transaction;
  source: IQuotationDocument;
}
