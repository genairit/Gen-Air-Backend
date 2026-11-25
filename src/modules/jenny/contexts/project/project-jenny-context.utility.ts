import {
  IJennyDocumentHit,
  IJennyProjectStatus,
  IJennyListedDocument,
  IJennySkippedDocument,
  IJennyQuotationSummary,
} from '../../interfaces/project-jenny-context.interface';

import {
  IProjectDocumentHit,
  IProjectDocumentSkip,
} from '@Modules/project-document/interfaces/project-document.interface';

import { TEXT } from '@Constants/text.constant';
import { IJennySource } from '../../interfaces/jenny.interface';
import { IUser } from '@Modules/user/interfaces/user.interface';
import { toDriveFileLink } from '@Utilities/google-drive.utility';
import { IDriveTreeFile } from '@Interfaces/google-drive.interface';
import { JENNY_PROMPT } from '../../constants/jenny-prompt.constant';
import { TProjectRead } from '@Modules/project/interfaces/project.interface';
import { IProjectQuotationView } from '@Modules/quotation/interfaces/quotation-document.interface';

const toFullName = (user?: IUser): string | null => {
  if (!user) {
    return null;
  }

  return `${user.firstName} ${user.lastName}`;
};

const toModifiedTimestamp = (file: IDriveTreeFile): number =>
  file.modifiedTime?.getTime() ?? 0;

export const buildProjectContextPrompt = (project: TProjectRead): string =>
  [
    JENNY_PROMPT.PROJECT_CONTEXT_LABEL,
    JSON.stringify({
      code: project.code,
      name: project.name,
      buildingName: project.parentProject?.name ?? null,
    }),
  ].join(TEXT.LINE_BREAK);

export const toProjectStatus = (
  project: TProjectRead,
): IJennyProjectStatus => ({
  code: project.code,
  name: project.name,
  notes: project.notes,
  city: project.addressCity,
  address: project.address,
  waitingReason: project.waitingReason,
  stage: project.stage?.name ?? null,
  updatedAt: project.updatedAt.toISOString(),
  isApartment: project.parentProjectId !== null,
  projectType: project.projectType?.name ?? null,
  buildingName: project.parentProject?.name ?? null,
  customerName: project.customer?.name ?? project.customerName,
  team: (project.members ?? []).map((member) => ({
    role: member.role,
    name: toFullName(member.user),
  })),
});

export const toQuotationSummary = (
  quotation: IProjectQuotationView,
): IJennyQuotationSummary => ({
  date: quotation.date,
  brand: quotation.brand,
  number: quotation.number,
  status: quotation.status,
  version: quotation.version,
  vatRatePercent: quotation.vatRate,
  discount: quotation.totals.discount,
  vatAmount: quotation.totals.vat,
  projectRole: quotation.projectRole,
  totalWithVat: quotation.totals.total,
  totalBeforeVat: quotation.totals.pretax,
  sharedFromCode: quotation.sharedFromCode,
  subtotalBeforeDiscount: quotation.totals.subtotal,
});

export const sortByRecentlyModified = (
  files: IDriveTreeFile[],
): IDriveTreeFile[] =>
  [...files].sort(
    (first, second) => toModifiedTimestamp(second) - toModifiedTimestamp(first),
  );

export const toListedDocument = (
  file: IDriveTreeFile,
): IJennyListedDocument => ({
  name: file.name,
  url: toDriveFileLink(file),
  folder: file.folderPath || null,
  modifiedTime: file.modifiedTime?.toISOString() ?? null,
});

export const toFileSource = (file: IDriveTreeFile): IJennySource => ({
  page: null,
  fileId: file.id,
  url: toDriveFileLink(file),
  fileName: file.name,
});

export const toDocumentHit = (hit: IProjectDocumentHit): IJennyDocumentHit => ({
  page: hit.page,
  snippet: hit.snippet,
  fileName: hit.fileName,
  folder: hit.folderPath || null,
});

export const toHitSource = (hit: IProjectDocumentHit): IJennySource => ({
  url: hit.url,
  page: hit.page,
  fileId: hit.fileId,
  fileName: hit.fileName,
});

export const toSkippedDocument = (
  skip: IProjectDocumentSkip,
): IJennySkippedDocument => ({
  reason: skip.reason,
  fileName: skip.fileName,
});
