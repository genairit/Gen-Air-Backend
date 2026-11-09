import { BadRequestException } from '@nestjs/common';
import { FIELD_LENGTHS } from '@Constants/field-length.constant';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { getHttpErrorPayload } from '@Utilities/http-error-payload.utility';
import { REASON_REQUIRED_PROJECT_STATUS_IDS } from '@Constants/project-status.constant';

interface IStageNoteRequest {
  toStageId: string;
  note: string | null;
}

const isReasonRequiredStage = (stageId: string): boolean =>
  REASON_REQUIRED_PROJECT_STATUS_IDS.includes(stageId);

export const resolveStageNote = ({
  toStageId,
  note,
}: IStageNoteRequest): string | null => {
  const trimmedNote = note?.trim() ?? '';
  const isNoteMissing = trimmedNote === '';
  const isNoteTooLong = trimmedNote.length > FIELD_LENGTHS.TRANSITION_NOTE;

  if (isNoteTooLong) {
    throw new BadRequestException(
      getHttpErrorPayload(HTTP_ERROR_CODES.TRANSITION_NOTE_TOO_LONG),
    );
  }

  if (isNoteMissing && isReasonRequiredStage(toStageId)) {
    throw new BadRequestException(
      getHttpErrorPayload(HTTP_ERROR_CODES.WAITING_REASON_REQUIRED),
    );
  }

  return isNoteMissing ? null : trimmedNote;
};
