import {
  Injectable,
  HttpStatus,
  CanActivate,
  HttpException,
  ExecutionContext,
  PayloadTooLargeException,
} from '@nestjs/common';

import { Request } from 'express';
import { QUESTIONNAIRE_LIMITS } from './constants/questionnaire.constant';

@Injectable()
export class QuestionnaireLimitGuard implements CanActivate {
  private readonly window = { startedAt: 0, reads: 0, submissions: 0 };
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    if (now - this.window.startedAt >= QUESTIONNAIRE_LIMITS.WINDOW_MS) {
      Object.assign(this.window, { startedAt: now, reads: 0, submissions: 0 });
    }
    const isSubmission = request.method === 'POST';
    const counter = isSubmission ? 'submissions' : 'reads';
    const limit = isSubmission
      ? QUESTIONNAIRE_LIMITS.SUBMISSIONS_PER_WINDOW
      : QUESTIONNAIRE_LIMITS.READS_PER_WINDOW;
    this.window[counter] += 1;
    if (this.window[counter] > limit) {
      throw new HttpException(
        'Questionnaire request limit reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const bodySize = Buffer.byteLength(
      JSON.stringify(request.body ?? null),
      'utf8',
    );
    if (bodySize > QUESTIONNAIRE_LIMITS.MAX_BODY_BYTES) {
      throw new PayloadTooLargeException(
        'Questionnaire submission is too large',
      );
    }
    return true;
  }
}
