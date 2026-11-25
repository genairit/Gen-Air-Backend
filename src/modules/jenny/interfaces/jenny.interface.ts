import {
  ILlmUsage,
  TLlmMessage,
  ILlmProvider,
  ILlmToolDefinition,
} from '@Interfaces/llm.interface';

import { JennyChatDto } from '../dto/jenny-chat.dto';
import { LLM_MESSAGE_ROLES } from '@Constants/llm.constant';
import { PermissionType } from '@Constants/authorization.constant';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { IProjectDocumentSession } from '@Modules/project-document/interfaces/project-document.interface';

export type TJennyToolArguments = Record<string, unknown>;

export interface IJennySource {
  url: string;
  fileId: string;
  fileName: string;
  page: number | null;
}

export interface IJennyToolResult {
  data: unknown;
  sources: IJennySource[];
}

export interface IJennyTool<TScope> {
  definition: ILlmToolDefinition;
  requiredPermissions: readonly PermissionType[];
  execute: (
    scope: TScope,
    args: TJennyToolArguments,
  ) => Promise<IJennyToolResult>;
}

export interface IJennyBoundTool {
  definition: ILlmToolDefinition;
  run: (args: TJennyToolArguments) => Promise<IJennyToolResult>;
}

export interface IJennyContextRequest {
  id: string;
  signal: AbortSignal;
  user: IAuthorizedUser;
}

export interface IJennyResolvedContext {
  prompt: string;
  tools: IJennyBoundTool[];
}

export interface IJennyContextProvider {
  resolve: (request: IJennyContextRequest) => Promise<IJennyResolvedContext>;
}

export interface IJennyProjectScope {
  projectId: string;
  documents: IProjectDocumentSession;
}

export interface IJennyChatResponse {
  message: string;
  sources: IJennySource[];
}

export interface IJennyToolLoopInput {
  maxRounds: number;
  signal: AbortSignal;
  provider: ILlmProvider;
  messages: TLlmMessage[];
  tools: IJennyBoundTool[];
}

export interface IJennyToolExecution {
  sources: IJennySource[];
  message: TLlmMessage<typeof LLM_MESSAGE_ROLES.TOOL>;
}

export interface IJennyToolLoopState {
  round: number;
  usage: ILlmUsage;
  toolNames: string[];
  messages: TLlmMessage[];
  sources: IJennySource[];
}

export interface IJennyToolLoopOutcome {
  rounds: number;
  message: string;
  usage: ILlmUsage;
  toolNames: string[];
  sources: IJennySource[];
}

export interface IJennyChatRequest {
  user: IAuthorizedUser;
  request: JennyChatDto;
  clientSignal: AbortSignal;
}

export interface IJennyConversation {
  signal: AbortSignal;
  request: JennyChatDto;
  context: IJennyResolvedContext;
}
