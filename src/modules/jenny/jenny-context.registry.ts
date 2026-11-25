import {
  JennyContextType,
  JENNY_CONTEXT_TYPES,
} from './constants/jenny.constant';

import {
  IJennyContextRequest,
  IJennyResolvedContext,
  IJennyContextProvider,
} from './interfaces/jenny.interface';

import { Injectable } from '@nestjs/common';
import { ProjectJennyContextService } from './contexts/project/project-jenny-context.service';

@Injectable()
export class JennyContextRegistry {
  private readonly providers: Record<JennyContextType, IJennyContextProvider>;

  constructor(projectContext: ProjectJennyContextService) {
    this.providers = { [JENNY_CONTEXT_TYPES.PROJECT]: projectContext };
  }

  resolve(
    type: JennyContextType,
    request: IJennyContextRequest,
  ): Promise<IJennyResolvedContext> {
    return this.providers[type].resolve(request);
  }
}
