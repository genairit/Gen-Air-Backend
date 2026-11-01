import request from 'supertest';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from '@Guards/auth.guard';
import { AuthService } from '@Modules/auth/auth.service';
import { ProjectDriveService } from './project-drive.service';
import { GOOGLE_DRIVE } from '@Constants/google-drive.constant';
import { ProjectService } from '@Modules/project/project.service';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ProjectDriveController } from './project-drive.controller';
import { DRIVE_UPLOAD_POLICY } from '@Constants/drive-upload.constant';
import { baselinePermissions } from '../../testing/authorization.fixture';
import { GoogleDriveService } from '@Providers/google-drive/google-drive.service';
import { DriveTemplateFolderService } from '@Modules/drive-template-folder/drive-template-folder.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const endpoint = `/project-drive/${projectId}/files`;
const pdf = Buffer.from('%PDF-1.7\nexample\n%%EOF');
describe('Drive multipart upload enforcement', () => {
  const application: { app: INestApplication<Server> | null } = { app: null };
  const uploadFile = jest.fn().mockResolvedValue({ id: 'uploaded' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProjectDriveController],
      providers: [
        ProjectDriveService,
        {
          provide: ProjectService,
          useValue: {
            getById: jest
              .fn()
              .mockResolvedValue({ driveFolderId: 'project-folder' }),
          },
        },
        { provide: DriveTemplateFolderService, useValue: {} },
        {
          provide: GoogleDriveService,
          useValue: {
            isConfigured: () => true,
            uploadFile,
            getFileMetadata: jest.fn().mockResolvedValue({
              id: 'project-folder',
              mimeType: GOOGLE_DRIVE.FOLDER_MIME_TYPE,
              trashed: false,
            }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            authenticate: () =>
              Promise.resolve({
                id: 'fixture',
                role: 'system_admin',
                permissions: baselinePermissions('system_admin'),
              }),
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    application.app = module.createNestApplication<INestApplication<Server>>();
    application.app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await application.app.init();
  });
  beforeEach(() => uploadFile.mockClear());
  afterAll(async () => application.app?.close());
  it('requires authentication for the policy and upload endpoints', async () => {
    await request(application.app!.getHttpServer())
      .get('/project-drive/upload-policy')
      .expect(401);
    await request(application.app!.getHttpServer())
      .post(endpoint)
      .attach('files', pdf, 'plan.pdf')
      .expect(401);
    expect(uploadFile).not.toHaveBeenCalled();
  });
  it('exposes the authoritative upload policy', async () => {
    const result = await request(application.app!.getHttpServer())
      .get('/project-drive/upload-policy')
      .auth('fixture', { type: 'bearer' })
      .expect(200);
    expect(result.body).toEqual(DRIVE_UPLOAD_POLICY);
  });
  it('rejects a mixed batch and spoofed MIME content before forwarding any file', async () => {
    await request(application.app!.getHttpServer())
      .post(endpoint)
      .auth('fixture', { type: 'bearer' })
      .attach('files', pdf, {
        filename: 'plan.pdf',
        contentType: 'application/pdf',
      })
      .attach('files', Buffer.from('MZ executable'), {
        filename: 'disguised.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    expect(uploadFile).not.toHaveBeenCalled();
  });
  it('uses the validated canonical MIME instead of the supplied MIME', async () => {
    await request(application.app!.getHttpServer())
      .post(endpoint)
      .auth('fixture', { type: 'bearer' })
      .attach('files', pdf, {
        filename: 'plan.pdf',
        contentType: 'application/x-msdownload',
      })
      .expect(201);
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'plan.pdf',
        mimeType: 'application/pdf',
      }),
    );
  });
  it('rejects too many files and missing files', async () => {
    await request(application.app!.getHttpServer())
      .post(endpoint)
      .auth('fixture', { type: 'bearer' })
      .expect(400);
    const pending = request(application.app!.getHttpServer())
      .post(endpoint)
      .auth('fixture', { type: 'bearer' });
    for (const index of Array.from({ length: 21 }, (_, index) => index)) {
      pending.attach('files', pdf, `plan-${index}.pdf`);
    }
    await pending.expect(400);
    expect(uploadFile).not.toHaveBeenCalled();
  });
});
