import {
  DRIVE_FOLDER_LINK,
  DRIVE_FOLDER_LINK_ERROR_CODES,
} from '../constants/drive-folder-link.constant';

import { BadRequestException } from '@nestjs/common';

const invalidDriveFolderReference = (): BadRequestException =>
  new BadRequestException({
    code: DRIVE_FOLDER_LINK_ERROR_CODES.INVALID_REFERENCE,
    message: 'יש להזין קישור לתיקיית Google Drive או מזהה תיקייה תקין',
  });

const isDriveFolderId = (value: string | null): value is string => {
  if (!value) {
    return false;
  }

  const validLength = value.length <= DRIVE_FOLDER_LINK.MAX_FOLDER_ID_LENGTH;
  const validCharacters = DRIVE_FOLDER_LINK.REFERENCE_PATTERN.test(value);
  return validLength && validCharacters;
};

export const parseDriveFolderReference = (reference: string): string => {
  const value = reference.trim();
  if (isDriveFolderId(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    const allowedHost = DRIVE_FOLDER_LINK.GOOGLE_HOSTS.some(
      (host) => host === url.hostname,
    );
    const folderId =
      url.pathname
        .match(/^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)\/?$/)
        ?.at(1) ?? null;
    if (
      url.protocol === 'https:' &&
      allowedHost &&
      isDriveFolderId(folderId) &&
      !url.port &&
      !url.username &&
      !url.password
    ) {
      return folderId;
    }
  } catch {
    throw invalidDriveFolderReference();
  }

  throw invalidDriveFolderReference();
};
