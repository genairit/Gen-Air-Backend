import { JennyService } from './jenny.service';
import { JennyChatDto } from './dto/jenny-chat.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JENNY_LIMITS } from './constants/jenny.constant';
import { RateLimit } from '@Decorators/rate-limit.decorator';
import { IJennyChatResponse } from './interfaces/jenny.interface';
import { Authenticated } from '@Decorators/authenticated.decorator';
import type { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { AuthenticatedUser } from '@Decorators/authenticated-user.decorator';
import { Body, Post, HttpCode, HttpStatus, Controller } from '@nestjs/common';
import { RequestAbortSignal } from '@Decorators/request-abort-signal.decorator';

@ApiTags('jenny')
@ApiBearerAuth()
@Controller('jenny')
export class JennyController {
  constructor(private readonly jennyService: JennyService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @Authenticated()
  @RateLimit(JENNY_LIMITS.REQUESTS_PER_MINUTE)
  chat(
    @Body() request: JennyChatDto,
    @AuthenticatedUser() user: IAuthorizedUser,
    @RequestAbortSignal() clientSignal: AbortSignal,
  ): Promise<IJennyChatResponse> {
    return this.jennyService.chat({ request, user, clientSignal });
  }
}
