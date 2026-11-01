export interface IQuestionnaireAnswer {
  value: string;
  questionKey: string;
}
export interface IQuestionnaireSubmission {
  id: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
  requestId: string;
  department: string;
  questionnaireId: string;
  answers: IQuestionnaireAnswer[];
}
export type TQuestionnaireSubmissionCreation = Omit<
  IQuestionnaireSubmission,
  'id' | 'createdAt' | 'updatedAt'
>;
export interface IQuestionnaireReceipt {
  id: string;
  receivedAt: Date;
}
