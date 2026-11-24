import {
  HttpException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseError } from 'sequelize';
import { getHttpErrorResponse } from './http-error.utility';
import { getHttpErrorPayload } from './http-error-payload.utility';
import { HTTP_ERROR_CODES } from '@Constants/http-error-code.constant';
import { DATABASE_CHECK_CONSTRAINTS } from '@Constants/database-constraint.constant';

describe('public HTTP error code boundary', () => {
  it('preserves the explicit import contract without copying arbitrary fields', () => {
    expect(
      getHttpErrorResponse(
        new UnprocessableEntityException({
          message: 'invalid template',
          code: HTTP_ERROR_CODES.INVALID_TEMPLATE,
          secret: 'private',
        }),
      ),
    ).toEqual({
      statusCode: 422,
      message: 'invalid template',
      code: HTTP_ERROR_CODES.INVALID_TEMPLATE,
    });
  });
  it.each(Object.values(HTTP_ERROR_CODES))(
    'preserves allowlisted code %s through the HTTP boundary',
    (code) => {
      expect(
        getHttpErrorResponse(
          new BadRequestException({
            code,
            message: 'Safe English message',
            privateValue: 'hidden',
          }),
        ),
      ).toEqual({
        statusCode: 400,
        code,
        message: 'Safe English message',
      });
    },
  );

  it('does not expose unapproved or database error codes', () => {
    expect(
      getHttpErrorResponse(
        new BadRequestException({ message: 'bad', code: '23505' }),
      ),
    ).toEqual({ statusCode: 400, message: 'bad' });
    expect(getHttpErrorResponse(new Error('private database details'))).toEqual(
      { statusCode: 500, message: 'Internal Server Error' },
    );
  });
  it('preserves raw HTTP messages and Nest validation message arrays', () => {
    expect(getHttpErrorResponse(new HttpException('raw', 400))).toEqual({
      statusCode: 400,
      message: 'raw',
    });
    expect(
      getHttpErrorResponse(
        new BadRequestException({
          message: ['name is required', 'email is invalid'],
        }),
      ),
    ).toEqual({
      statusCode: 400,
      message: ['name is required', 'email is invalid'],
    });
  });

  it.each([
    { message: { private: 'hidden' } },
    { message: 42 },
    { message: ['valid', 42] },
  ])('falls back for malformed public message %p', ({ message }) => {
    const error = new BadRequestException({ message });
    expect(getHttpErrorResponse(error)).toEqual({
      statusCode: 400,
      message: error.message,
    });
  });

  it('keeps ordinary errors and explicitly safe response data compatible', () => {
    expect(getHttpErrorResponse(new BadRequestException('bad'))).toEqual({
      statusCode: 400,
      message: 'bad',
    });
    expect(
      getHttpErrorResponse(
        new BadRequestException({
          message: 'bad',
          safeResponse: { remaining: 0 },
        }),
      ),
    ).toEqual({
      statusCode: 400,
      message: 'bad',
      safeResponse: { remaining: 0 },
    });
  });
});

describe('database constraint HTTP boundary', () => {
  it('maps the named quotation context check with a safe centralized payload', () => {
    const error = new DatabaseError(
      Object.assign(new Error('private SQL detail'), {
        sql: 'private query',
        code: '23514',
        constraint: DATABASE_CHECK_CONSTRAINTS.TASK_QUOTATION_CONTEXT,
      }),
    );
    expect(getHttpErrorResponse(error)).toEqual({
      statusCode: 409,
      ...getHttpErrorPayload(HTTP_ERROR_CODES.TASK_QUOTATION_CONTEXT_LOCKED),
    });
  });
  it.each([
    { code: '23514', constraint: 'unrelated_check' },
    {
      code: '23505',
      constraint: DATABASE_CHECK_CONSTRAINTS.TASK_QUOTATION_CONTEXT,
    },
  ])('preserves unrelated database error behavior for %p', (details) => {
    const error = new DatabaseError(
      Object.assign(new Error('private details'), {
        sql: 'private query',
        ...details,
      }),
    );
    expect(getHttpErrorResponse(error)).toEqual({
      statusCode: 500,
      message: 'Internal Server Error',
    });
  });
  it('does not treat arbitrary objects or client HTTP payloads as database constraints', () => {
    const fields = {
      code: '23514',
      constraint: DATABASE_CHECK_CONSTRAINTS.TASK_QUOTATION_CONTEXT,
    };
    expect(getHttpErrorResponse({ parent: fields })).toEqual({
      statusCode: 500,
      message: 'Internal Server Error',
    });
    expect(
      getHttpErrorResponse(
        new BadRequestException({ ...fields, message: 'invalid' }),
      ),
    ).toEqual({ statusCode: 400, message: 'invalid' });
  });
});
