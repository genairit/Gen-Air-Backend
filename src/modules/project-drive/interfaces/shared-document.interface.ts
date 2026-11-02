import { SharedDocumentStatusType } from '../constants/shared-document.constant';

export interface ISharedDocument {
  status: SharedDocumentStatusType;
  file: { id: string; name: string; url: string } | null;
}
