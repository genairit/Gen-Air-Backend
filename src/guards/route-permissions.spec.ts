import 'reflect-metadata';
import { AppController } from '../app.controller';
import { METADATA_KEYS } from '@Constants/metadata-keys';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { AuthController } from '@Modules/auth/auth.controller';
import { UserController } from '@Modules/user/user.controller';
import { TaskController } from '@Modules/task/task.controller';
import { PERMISSION_VALUES } from '@Constants/authorization.constant';
import { AddressController } from '@Modules/address/address.controller';
import { ProjectController } from '@Modules/project/project.controller';
import { CustomerController } from '@Modules/customer/customer.controller';
import { ProjectTypeController } from '@Modules/project-type/project-type.controller';
import { ProjectStageController } from '@Modules/project-stage/project-stage.controller';
import { ProjectDriveController } from '@Modules/project-drive/project-drive.controller';
import { ProjectMemberController } from '@Modules/project-member/project-member.controller';
import { DriveTemplateFolderController } from '@Modules/drive-template-folder/drive-template-folder.controller';
import { ProjectStageTransitionController } from '@Modules/project-stage-transition/project-stage-transition.controller';

const CONTROLLERS = [
  AppController,
  AuthController,
  UserController,
  TaskController,
  AddressController,
  ProjectController,
  CustomerController,
  ProjectTypeController,
  ProjectStageController,
  ProjectDriveController,
  ProjectMemberController,
  DriveTemplateFolderController,
  ProjectStageTransitionController,
];

const ROUTES = CONTROLLERS.flatMap((controller) =>
  Object.getOwnPropertyNames(controller.prototype).flatMap((name) => {
    const handler: unknown = Reflect.get(controller.prototype, name);
    if (typeof handler !== 'function') {
      return [];
    }

    if (!Reflect.hasMetadata(METHOD_METADATA, handler)) {
      return [];
    }

    return [{ name: `${controller.name}.${name}`, handler }];
  }),
);

const hasRegisteredPermissions = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  return value.every((key: unknown) =>
    PERMISSION_VALUES.some((permission) => permission === key),
  );
};

describe('Application route authorization inventory', () => {
  it('covers all application controllers and a nonempty endpoint set', () => {
    expect(CONTROLLERS).toHaveLength(13);
    expect(ROUTES.length).toBeGreaterThan(40);
  });

  it.each(ROUTES)(
    '$name has an explicit known feature or identity/public policy',
    ({ handler }) => {
      const isPublic: unknown = Reflect.getMetadata(
        METADATA_KEYS.IS_PUBLIC,
        handler,
      );
      const isIdentityOnly: unknown = Reflect.getMetadata(
        METADATA_KEYS.AUTHENTICATED_ONLY,
        handler,
      );
      const required: unknown = Reflect.getMetadata(
        METADATA_KEYS.PERMISSIONS,
        handler,
      );
      const policyCount = [
        isPublic === true,
        isIdentityOnly === true,
        hasRegisteredPermissions(required),
      ].filter((policy) => policy).length;

      expect(policyCount).toBe(1);
    },
  );
});
