import { QuestionnaireFieldType } from '../constants/questionnaire.constant';

export interface IQuestionnaireField {
  key: string;
  label: string;
  helpText: string;
  required: boolean;
  maxLength: number;
  type: QuestionnaireFieldType;
}
export interface IQuestionnaire {
  id: string;
  slug: string;
  title: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  introduction: string;
  acceptingResponses: boolean;
  definition: IQuestionnaireField[];
}
export type TPublicQuestionnaire = Pick<
  IQuestionnaire,
  'id' | 'slug' | 'title' | 'version' | 'introduction' | 'definition'
>;
