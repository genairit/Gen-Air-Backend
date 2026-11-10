import { QueueService } from './queue.service.js';
import type { IHealthResponse } from '../../interfaces/worker.interface.js';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

@Controller('health')
export class WorkerController {
  constructor(private readonly queue: QueueService) {}

  @Get('live')
  live(): IHealthResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  ready(): IHealthResponse {
    if (!this.queue.isReady()) {
      throw new ServiceUnavailableException('Queue consumer is not ready');
    }

    return { status: 'ready' };
  }
}
