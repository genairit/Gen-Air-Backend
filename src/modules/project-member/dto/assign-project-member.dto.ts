import {
  PROJECT_MEMBER_ROLES,
  type ProjectMemberRoleType,
} from '@Constants/user-role.constant';

import { IsIn, IsUUID, IsNotEmpty } from 'class-validator';

export class AssignProjectMemberDto {
  @IsNotEmpty()
  @IsUUID()
  declare userId: string;

  @IsNotEmpty()
  @IsIn(PROJECT_MEMBER_ROLES)
  declare role: ProjectMemberRoleType;
}
