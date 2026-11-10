import {
  QUOTATION_STATUS,
  QUOTATION_CANCELLATION_KIND,
} from '../../modules/quotation/constants/quotation.constant';

import {
  appendQuotationCancellation,
  hasApprovedQuotationSnapshot,
  restoreQuotationCancellation,
} from '../../modules/quotation/utilities/quotation-cancellation.utility';

describe('quotation cancellation history', () => {
  test('restores a cancellation to the exact status immediately before it', () => {
    const history = appendQuotationCancellation({
      history: [],
      fromStatus: QUOTATION_STATUS.REVIEW,
      cancelledById: 'actor-1',
      cancelledByName: 'First Actor',
      reason: 'First cancellation reason',
      kind: QUOTATION_CANCELLATION_KIND.MANUAL,
      cancelledAt: '2026-10-31T12:00:00.000Z',
    });
    const cancelled = appendQuotationCancellation({
      history,
      fromStatus: QUOTATION_STATUS.DRAFT,
      cancelledById: 'actor-2',
      cancelledByName: 'Second Actor',
      reason: 'Second cancellation reason',
      kind: QUOTATION_CANCELLATION_KIND.MANUAL,
      cancelledAt: '2026-10-31T13:00:00.000Z',
    });

    const restored = restoreQuotationCancellation({
      history: cancelled,
      restoredById: 'actor-3',
      restoredByName: 'Third Actor',
      restoredAt: '2026-10-31T14:00:00.000Z',
    });

    expect(restored).toEqual({
      status: QUOTATION_STATUS.DRAFT,
      history: [
        history[0],
        {
          ...cancelled[1],
          restoredAt: '2026-10-31T14:00:00.000Z',
          restoredById: 'actor-3',
          restoredByName: 'Third Actor',
        },
      ],
    });
    expect(
      restoreQuotationCancellation({
        history: restored?.history ?? [],
        restoredById: 'actor-4',
        restoredByName: 'Fourth Actor',
        restoredAt: '2026-10-31T15:00:00.000Z',
      }),
    ).toBeNull();
  });

  test('cancelled approved quotations retain their approved snapshot', () => {
    expect(
      hasApprovedQuotationSnapshot({
        status: QUOTATION_STATUS.CANCELLED,
        cancelledFromStatus: QUOTATION_STATUS.APPROVED,
      }),
    ).toBe(true);
    expect(
      hasApprovedQuotationSnapshot({
        status: QUOTATION_STATUS.CANCELLED,
        cancelledFromStatus: QUOTATION_STATUS.REVIEW,
      }),
    ).toBe(false);
  });
});
