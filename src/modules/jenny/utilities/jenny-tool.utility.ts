import { hasPermission } from '@Utilities/permission.utility';
import { IAuthorizedUser } from '@Interfaces/authorized-user.interface';
import { IJennyTool, IJennyBoundTool } from '../interfaces/jenny.interface';

interface IJennyToolBinding<TScope> {
  scope: TScope;
  user: IAuthorizedUser;
  tools: readonly IJennyTool<TScope>[];
}

const isToolPermitted = <TScope>(
  user: IAuthorizedUser,
  tool: IJennyTool<TScope>,
): boolean =>
  tool.requiredPermissions.every((permission) =>
    hasPermission(user, permission),
  );

const bindTool = <TScope>(
  tool: IJennyTool<TScope>,
  scope: TScope,
): IJennyBoundTool => ({
  definition: tool.definition,
  run: (args) => tool.execute(scope, args),
});

export const bindPermittedTools = <TScope>(
  binding: IJennyToolBinding<TScope>,
): IJennyBoundTool[] =>
  binding.tools
    .filter((tool) => isToolPermitted(binding.user, tool))
    .map((tool) => bindTool(tool, binding.scope));
