import { AppService } from './app.service';
import { Get, Controller } from '@nestjs/common';
import { Public } from '@Decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
