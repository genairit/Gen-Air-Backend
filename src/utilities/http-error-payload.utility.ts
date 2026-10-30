import { HttpErrorCodeType } from '@Constants/http-error-code.constant';
import { HTTP_ERROR_MESSAGES } from '@Constants/http-error-message.constant';

export const getHttpErrorPayload = (
  code: HttpErrorCodeType,
): { code: HttpErrorCodeType; message: string } => ({
  code,
  message: HTTP_ERROR_MESSAGES[code],
});
