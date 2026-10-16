import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { of, throwError, lastValueFrom } from 'rxjs';
import { mkdtemp, writeFile, access, rm } from 'node:fs/promises';
import { UploadCleanupInterceptor } from './upload-cleanup.interceptor';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';

describe('UploadCleanupInterceptor', () => {
  it.each([true, false])(
    'cleans disk uploads when the handler succeeds: %s',
    async (success) => {
      const directory = await mkdtemp(join(tmpdir(), 'upload-cleanup-'));
      const path = join(directory, 'upload');
      await writeFile(path, 'temporary');
      const interceptor = new UploadCleanupInterceptor();
      const request = { files: [{ path }] };
      const context = new ExecutionContextHost([request]);
      const next = {
        handle: () =>
          success
            ? of('ok')
            : throwError(() => new Error('Pipe rejected request')),
      };
      try {
        const result = lastValueFrom(interceptor.intercept(context, next));
        if (success) {
          await expect(result).resolves.toBe('ok');
        }
        if (!success) {
          await expect(result).rejects.toThrow('Pipe rejected');
        }
        await expect(access(path)).rejects.toThrow();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
