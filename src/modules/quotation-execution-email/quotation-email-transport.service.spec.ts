import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type Mail from 'nodemailer/lib/mailer';
import { ServiceUnavailableException } from '@nestjs/common';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { EnvironmentManager } from '@Utilities/environment-manager.utility';
import { QuotationEmailTransport } from './quotation-email-transport.service';

const attachment = {
  filename: 'plan.pdf',
  content: Buffer.from('plan'),
  contentType: 'application/pdf',
};

const message = {
  to: ['one@example.test', 'two@example.test'],
  text: 'Body',
  html: '<p>Body</p>',
  subject: 'Subject',
  replyTo: 'sender@example.test',
  requestId: 'f29c0715-5a7a-45f9-841a-845d4f1f4627',
  logo: Buffer.from('logo'),
  attachments: [attachment, { ...attachment, filename: 'plans.zip' }] as [
    typeof attachment,
    typeof attachment,
  ],
};

class PartialTransport extends QuotationEmailTransport {
  sent: Mail.Options | null = null;
  config: SMTPTransport.Options | null = null;

  protected override deliver(
    config: SMTPTransport.Options,
    options: Mail.Options,
  ) {
    this.config = config;
    this.sent = options;
    return Promise.resolve({
      messageId: '<provider@example.test>',
      accepted: ['one@example.test'],
      rejected: ['two@example.test'],
    });
  }
}

class MissingLogoTransport extends QuotationEmailTransport {
  protected override logoPath(): string {
    return join(tmpdir(), `genair-missing-logo-${randomUUID()}.png`);
  }
}

describe('QuotationEmailTransport', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports a missing signature asset as a known pre-send failure', async () => {
    await expect(new MissingLogoTransport().loadLogo()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('treats partial SMTP acceptance as uncertain instead of success', async () => {
    const values: Record<string, string> = {
      EMAIL_DELIVERY_MODE: 'allowlist',
      EMAIL_ALLOWED_RECIPIENTS: 'one@example.test,two@example.test',
      SMTP_FROM: 'projects@example.test',
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '587',
    };
    jest
      .spyOn(EnvironmentManager, 'get')
      .mockImplementation((key) => values[key] ?? '');
    const transport = new PartialTransport();
    await expect(transport.send(message)).rejects.toMatchObject({
      messageId: '<provider@example.test>',
      acceptedCount: 1,
      rejectedCount: 1,
    });
    expect(transport.config).toEqual(
      expect.objectContaining({
        port: 587,
        secure: false,
        requireTLS: true,
      }),
    );
    expect(transport.sent).toEqual(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({ filename: 'plan.pdf' }),
          expect.objectContaining({ filename: 'plans.zip' }),
          expect.objectContaining({
            cid: 'genair-logo@genair',
            contentDisposition: 'inline',
          }),
        ],
      }),
    );
  });
});
