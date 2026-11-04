import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { readFile } from 'node:fs/promises';
import isEmail from 'validator/lib/isEmail';
import type Mail from 'nodemailer/lib/mailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';

export class PartialQuotationEmailDeliveryError extends Error {
  constructor(
    readonly messageId: string,
    readonly acceptedCount: number,
    readonly rejectedCount: number,
  ) {
    super('SMTP accepted only some recipients');
  }
}

export interface IQuotationMailAttachment {
  content: Buffer;
  filename: string;
  contentType: string;
}

export interface IQuotationMail {
  to: string[];
  text: string;
  html: string;
  logo: Buffer;
  subject: string;
  replyTo: string;
  requestId: string;
  attachments: [IQuotationMailAttachment, IQuotationMailAttachment];
}

interface ISmtpSendResult {
  messageId: string;
  accepted: unknown[];
  rejected: unknown[];
}

@Injectable()
export class QuotationEmailTransport {
  async loadLogo(): Promise<Buffer> {
    try {
      return await readFile(this.logoPath());
    } catch {
      throw new ServiceUnavailableException(
        'GenAir email signature image is unavailable',
      );
    }
  }

  protected logoPath(): string {
    return join(__dirname, '../../assets/genair-logo.png');
  }

  assertReady(recipients: string[]): void {
    const mode = EnvironmentManager.get('EMAIL_DELIVERY_MODE', {
      defaultValue: 'disabled',
    });
    if (mode !== 'allowlist' && mode !== 'live') {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }
    if (
      mode === 'live' &&
      EnvironmentManager.get('NODE_ENV') !== 'production'
    ) {
      throw new ServiceUnavailableException(
        'Live email delivery requires production mode',
      );
    }
    if (mode === 'allowlist') {
      const allowed = new Set(
        EnvironmentManager.get('EMAIL_ALLOWED_RECIPIENTS')
          .split(',')
          .map((address) => address.trim().toLowerCase())
          .filter(Boolean),
      );
      if (
        allowed.size === 0 ||
        recipients.some((address) => !allowed.has(address.toLowerCase()))
      ) {
        throw new BadRequestException(
          'One or more recipients are outside the email test allowlist',
        );
      }
    }
    const from = EnvironmentManager.get('SMTP_FROM');
    const host = EnvironmentManager.get('SMTP_HOST');
    const port = Number(EnvironmentManager.get('SMTP_PORT'));
    if (
      !isEmail(from) ||
      !host ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw new ServiceUnavailableException(
        'SMTP sender configuration is incomplete',
      );
    }
    const user = EnvironmentManager.get('SMTP_USER');
    const password = EnvironmentManager.get('SMTP_PASSWORD');
    if (Boolean(user) !== Boolean(password)) {
      throw new ServiceUnavailableException('SMTP credentials are incomplete');
    }
  }

  async send(message: IQuotationMail): Promise<string> {
    this.assertReady(message.to);
    const from = EnvironmentManager.get('SMTP_FROM');
    const port = Number(EnvironmentManager.get('SMTP_PORT'));
    const user = EnvironmentManager.get('SMTP_USER');
    const password = EnvironmentManager.get('SMTP_PASSWORD');
    const config: SMTPTransport.Options = {
      host: EnvironmentManager.get('SMTP_HOST'),
      port,
      secure: EnvironmentManager.get('SMTP_SECURE') === 'true' || port === 465,
      requireTLS: true,
      ...(user && password ? { auth: { user, pass: password } } : {}),
    };
    const domain = from.split('@')[1];
    const messageId = `<quotation-execution-${message.requestId}@${domain}>`;
    const result = await this.deliver(config, {
      from,
      to: message.to,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId,
      attachments: [
        ...message.attachments,
        {
          filename: 'genair-logo.png',
          content: message.logo,
          cid: 'genair-logo@genair',
          contentType: 'image/png',
          contentDisposition: 'inline',
        },
      ],
    });
    const providerMessageId = result.messageId || messageId;
    if (
      result.rejected.length > 0 ||
      result.accepted.length !== message.to.length
    ) {
      throw new PartialQuotationEmailDeliveryError(
        providerMessageId,
        result.accepted.length,
        result.rejected.length,
      );
    }
    return providerMessageId;
  }

  protected deliver(
    config: SMTPTransport.Options,
    options: Mail.Options,
  ): Promise<ISmtpSendResult> {
    return nodemailer.createTransport(config).sendMail(options);
  }
}
