import { BadRequestException } from '@nestjs/common';
import { resolveStageNote } from './project-stage-note.utility';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { PROJECT_STATUS_IDS } from '@Constants/project-status.constant';

const WAITING_STAGE_ID = PROJECT_STATUS_IDS.WAITING_FOR_RESPONSE;

const errorResponseOf = (resolve: () => unknown): unknown => {
  try {
    resolve();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);

    return error instanceof BadRequestException ? error.getResponse() : null;
  }

  return null;
};

describe('resolveStageNote', () => {
  it.each([null, '', '  \t\n '])(
    'requires a reason to wait for a response: %p',
    (note) => {
      expect(
        errorResponseOf(() =>
          resolveStageNote({ toStageId: WAITING_STAGE_ID, note }),
        ),
      ).toMatchObject({ code: HTTP_ERROR_CODES.WAITING_REASON_REQUIRED });
    },
  );

  it('returns the trimmed waiting reason', () => {
    expect(
      resolveStageNote({ toStageId: WAITING_STAGE_ID, note: '  סיבה  ' }),
    ).toBe('סיבה');
  });

  it('rejects a note longer than the stored column for any status', () => {
    const note = 'א'.repeat(FIELD_LENGTHS.TRANSITION_NOTE + 1);

    expect(
      errorResponseOf(() =>
        resolveStageNote({ toStageId: PROJECT_STATUS_IDS.COMPLETED, note }),
      ),
    ).toMatchObject({ code: HTTP_ERROR_CODES.TRANSITION_NOTE_TOO_LONG });
  });

  it.each([
    PROJECT_STATUS_IDS.NOT_STARTED,
    PROJECT_STATUS_IDS.IN_PROGRESS,
    PROJECT_STATUS_IDS.COMPLETED,
  ])('keeps the note optional for %s and stores blank as null', (toStageId) => {
    expect(resolveStageNote({ toStageId, note: null })).toBeNull();
    expect(resolveStageNote({ toStageId, note: '   ' })).toBeNull();
  });
});
