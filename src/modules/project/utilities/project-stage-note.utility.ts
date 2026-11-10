import { BadRequestException } from '@nestjs/common';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { getHttpErrorPayload } from '@Utilities/http-error-payload.utility';
import { IProjectStageChangeRequest } from '../interfaces/project.interface';
import { REASON_REQUIRED_PROJECT_STATUS_IDS } from '@Constants/project-status.constant';

interface IStageNoteRequest {
  toStageId: string;
  note: string | null;
}

const isReasonRequiredStage = (stageId: string): boolean =>
  REASON_REQUIRED_PROJECT_STATUS_IDS.includes(stageId);

export const findChangingStageId = ({
  project,
  toStageId,
}: IProjectStageChangeRequest): string | null => {
  const isStageChanging = toStageId !== null && toStageId !== project.stageId;

  return isStageChanging ? toStageId : null;
};

export const resolveStageNote = ({
  toStageId,
  note,
}: IStageNoteRequest): string | null => {
  const normalizedNote = note?.trim() ?? null;
  const isNoteMissing = normalizedNote === null || normalizedNote === '';

  if (isNoteMissing && isReasonRequiredStage(toStageId)) {
    throw new BadRequestException(
      getHttpErrorPayload(HTTP_ERROR_CODES.WAITING_REASON_REQUIRED),
    );
  }

  return isNoteMissing ? null : normalizedNote;
};
