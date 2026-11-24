export interface IQuotationCloneCommand {
  actorId: string;
  createdAt?: Date;
  quotationId: string;
  payloadHash: string;
  idempotencyKey: string;
}
export interface IQuotationCloneIssue {
  sku: string;
  reason: string;
  description: string;
}
