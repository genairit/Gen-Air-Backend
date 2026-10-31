import { Controller, Get } from '@nestjs/common';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { QuotationRuleService } from './quotation-rule.service';
import { RequirePermissions } from '@Decorators/require-permissions.decorator';

@Controller('quotation-rule')
export class QuotationRuleController {
  constructor(private readonly service: QuotationRuleService) {}
  @Get()
  @RequirePermissions(PERMISSIONS.QUOTATIONS_READ)
  configuration(): ReturnType<QuotationRuleService['configuration']> {
    return this.service.configuration();
  }
}
