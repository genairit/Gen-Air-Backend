import {
  DRIVE_TEMPLATE_TAGS,
  DriveTemplateTagType,
} from '@Constants/drive-template.constant';

import { IProject } from '@Modules/project/interfaces/project.interface';

type TProjectNaming = Pick<IProject, 'code' | 'name'>;

const TAG_RESOLVERS: Record<
  DriveTemplateTagType,
  (project: TProjectNaming) => string
> = {
  [DRIVE_TEMPLATE_TAGS.PROJECT_ID]: (project) => project.code,
  [DRIVE_TEMPLATE_TAGS.PROJECT_NAME]: (project) => project.name,
};

export const renderDriveFolderName = (
  template: string,
  project: TProjectNaming,
): string =>
  Object.entries(TAG_RESOLVERS).reduce(
    (name, [tag, resolveTag]) =>
      name.replaceAll(tag, () => resolveTag(project)),
    template,
  );
