import {
  IJennyTool,
  IJennyToolResult,
  IJennyProjectScope,
} from '../../../interfaces/jenny.interface';

import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@Constants/authorization.constant';
import { JENNY_LIMITS } from '../../../constants/jenny.constant';
import { toQuotationSummary } from '../project-jenny-context.utility';
import { QuotationService } from '@Modules/quotation/quotation.service';
import { PROJECT_JENNY_TOOL_DEFINITIONS } from '../project-jenny-tools.constant';

@Injectable()
export class QuotationJennyTool implements IJennyTool<IJennyProjectScope> {
  readonly definition = PROJECT_JENNY_TOOL_DEFINITIONS.GET_QUOTATION;
  readonly requiredPermissions = [
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.QUOTATIONS_READ,
  ];

  constructor(private readonly quotationService: QuotationService) {}

  async execute(scope: IJennyProjectScope): Promise<IJennyToolResult> {
    const page = await this.quotationService.listByProject(scope.projectId, {
      batchSize: JENNY_LIMITS.MAX_QUOTATIONS,
    });

    return {
      sources: [],
      data: {
        totalQuotations: page.total,
        quotations: page.items.map(toQuotationSummary),
      },
    };
  }
}
