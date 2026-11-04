import {
  Injectable,
  HttpStatus,
  CanActivate,
  HttpException,
  ExecutionContext,
  PayloadTooLargeException,
} from '@nestjs/common';

import {
  createAnonymousClient,
  verifyAnonymousClient,
  anonymousClientSetCookie,
  readAnonymousClientCookie,
} from '@Utilities/anonymous-client.utility';

import { Request, Response } from 'express';
import { QUESTIONNAIRE_LIMITS } from './constants/questionnaire.constant';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';

interface IQuestionnaireWindow {
  reads: number;
  startedAt: number;
  submissions: number;
}

@Injectable()
export class QuestionnaireLimitGuard implements CanActivate {
  private readonly clients = new Map<string, IQuestionnaireWindow>();
  private readonly total: IQuestionnaireWindow = {
    startedAt: 0,
    reads: 0,
    submissions: 0,
  };

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = Date.now();
    const clientId = this.identifyClient(request, response);
    const window = this.clientWindow(clientId, now);
    this.resetExpired(this.total, now);
    const isSubmission = request.method === 'POST';
    const counter = isSubmission ? 'submissions' : 'reads';
    const limit = isSubmission
      ? QUESTIONNAIRE_LIMITS.SUBMISSIONS_PER_WINDOW
      : QUESTIONNAIRE_LIMITS.READS_PER_WINDOW;
    const totalLimit = isSubmission
      ? QUESTIONNAIRE_LIMITS.TOTAL_SUBMISSIONS_PER_WINDOW
      : QUESTIONNAIRE_LIMITS.TOTAL_READS_PER_WINDOW;
    window[counter] += 1;
    this.total[counter] += 1;
    if (window[counter] > limit || this.total[counter] > totalLimit) {
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

  private identifyClient(request: Request, response: Response): string {
    const secret = EnvironmentManager.get('QUESTIONNAIRE_CLIENT_SECRET', {
      errorOnMissing: true,
    });
    const supplied = readAnonymousClientCookie(request.headers.cookie ?? null);
    const clientId = verifyAnonymousClient(supplied, secret);
    if (clientId) {
      return clientId;
    }

    const created = createAnonymousClient(secret);
    response.setHeader('Set-Cookie', anonymousClientSetCookie(created.token));
    return created.clientId;
  }

  private clientWindow(clientId: string, now: number): IQuestionnaireWindow {
    for (const [key, value] of this.clients) {
      if (now - value.startedAt >= QUESTIONNAIRE_LIMITS.WINDOW_MS) {
        this.clients.delete(key);
      }
    }

    const existing = this.clients.get(clientId);
    if (existing) {
      return existing;
    }

    if (this.clients.size >= QUESTIONNAIRE_LIMITS.MAX_CLIENTS) {
      const oldest = this.clients.keys().next().value;
      if (oldest) {
        this.clients.delete(oldest);
      }
    }

    const window = { startedAt: now, reads: 0, submissions: 0 };
    this.clients.set(clientId, window);
    return window;
  }

  private resetExpired(window: IQuestionnaireWindow, now: number): void {
    if (now - window.startedAt >= QUESTIONNAIRE_LIMITS.WINDOW_MS) {
      Object.assign(window, { startedAt: now, reads: 0, submissions: 0 });
    }
  }
}
