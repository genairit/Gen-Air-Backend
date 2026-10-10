import { LogColor } from '@Constants/logs';
import { HttpStatus } from '@nestjs/common';

export enum StatusCodeLevel {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  REDIRECT = 'REDIRECT',
  SERVER_ERROR = 'SERVER_ERROR',
  INFRASTRUCTURE_ERROR = 'INFRASTRUCTURE_ERROR',
}

export const LEVEL_BY_STATUS_CODE = {
  [HttpStatus.CONTINUE]: StatusCodeLevel.INFO,
  [HttpStatus.OK]: StatusCodeLevel.SUCCESS,
  [HttpStatus.CREATED]: StatusCodeLevel.SUCCESS,
  [HttpStatus.ACCEPTED]: StatusCodeLevel.SUCCESS,
  [HttpStatus.MOVED_PERMANENTLY]: StatusCodeLevel.REDIRECT,
  [HttpStatus.FOUND]: StatusCodeLevel.REDIRECT,
  [HttpStatus.SEE_OTHER]: StatusCodeLevel.REDIRECT,
  [HttpStatus.NOT_MODIFIED]: StatusCodeLevel.REDIRECT,
  [HttpStatus.BAD_REQUEST]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.UNAUTHORIZED]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.FORBIDDEN]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.NOT_FOUND]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.METHOD_NOT_ALLOWED]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.NOT_ACCEPTABLE]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.CONFLICT]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.GONE]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.INTERNAL_SERVER_ERROR]: StatusCodeLevel.INFRASTRUCTURE_ERROR,
  [HttpStatus.NOT_IMPLEMENTED]: StatusCodeLevel.INFRASTRUCTURE_ERROR,
  [HttpStatus.BAD_GATEWAY]: StatusCodeLevel.INFRASTRUCTURE_ERROR,
  [HttpStatus.SERVICE_UNAVAILABLE]: StatusCodeLevel.INFRASTRUCTURE_ERROR,
  [HttpStatus.GATEWAY_TIMEOUT]: StatusCodeLevel.INFRASTRUCTURE_ERROR,
  [HttpStatus.HTTP_VERSION_NOT_SUPPORTED]: StatusCodeLevel.INFRASTRUCTURE_ERROR,
  [HttpStatus.PRECONDITION_REQUIRED]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.UNPROCESSABLE_ENTITY]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.TOO_MANY_REQUESTS]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.EXPECTATION_FAILED]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.REQUEST_TIMEOUT]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.LENGTH_REQUIRED]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.PAYLOAD_TOO_LARGE]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.URI_TOO_LONG]: StatusCodeLevel.SERVER_ERROR,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: StatusCodeLevel.SERVER_ERROR,
} as const;

export const STATUS_LEVEL_LOG_COLORS = {
  [StatusCodeLevel.INFO]: LogColor.cyan,
  [StatusCodeLevel.SUCCESS]: LogColor.green,
  [StatusCodeLevel.REDIRECT]: LogColor.yellow,
  [StatusCodeLevel.SERVER_ERROR]: LogColor.red,
  [StatusCodeLevel.INFRASTRUCTURE_ERROR]: LogColor.red,
} as const;
