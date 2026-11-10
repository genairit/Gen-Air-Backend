import {
  QUOTATION_STATUS,
  type TQuotationRestorableStatus,
  type TQuotationCancellationKind,
} from '../constants/quotation.constant';

import type {
  IQuotation,
  IQuotationCancellation,
} from '../interfaces/quotation.interface';

import type { IUser } from '@Modules/user/interfaces/user.interface';

interface IAppendQuotationCancellationInput {
  reason: string;
  cancelledAt: string;
  cancelledById: string;
  cancelledByName: string;
  kind: TQuotationCancellationKind;
  history: IQuotationCancellation[];
  fromStatus: TQuotationRestorableStatus;
}

interface IRestoreQuotationCancellationInput {
  restoredAt: string;
  restoredById: string;
  restoredByName: string;
  history: IQuotationCancellation[];
}

export const appendQuotationCancellation = (
  input: IAppendQuotationCancellationInput,
): IQuotationCancellation[] => [
  ...input.history,
  {
    kind: input.kind,
    fromStatus: input.fromStatus,
    cancelledAt: input.cancelledAt,
    cancelledById: input.cancelledById,
    cancelledByName: input.cancelledByName,
    reason: input.reason,
    restoredAt: null,
    restoredById: null,
    restoredByName: null,
  },
];

export const restoreQuotationCancellation = (
  input: IRestoreQuotationCancellationInput,
): {
  history: IQuotationCancellation[];
  status: TQuotationRestorableStatus;
} | null => {
  const activeCancellation = input.history.at(-1);

  if (!activeCancellation || activeCancellation.restoredAt !== null) {
    return null;
  }

  return {
    status: activeCancellation.fromStatus,
    history: [
      ...input.history.slice(0, -1),
      {
        ...activeCancellation,
        restoredAt: input.restoredAt,
        restoredById: input.restoredById,
        restoredByName: input.restoredByName,
      },
    ],
  };
};

export const quotationActorName = (
  actor: Pick<IUser, 'firstName' | 'lastName'>,
): string => [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim();

export const hasApprovedQuotationSnapshot = (
  quotation: Pick<IQuotation, 'status' | 'cancelledFromStatus'>,
): boolean =>
  quotation.status === QUOTATION_STATUS.APPROVED ||
  (quotation.status === QUOTATION_STATUS.CANCELLED &&
    quotation.cancelledFromStatus === QUOTATION_STATUS.APPROVED);
