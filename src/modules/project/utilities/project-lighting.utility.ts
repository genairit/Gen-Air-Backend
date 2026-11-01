import { BadRequestException } from '@nestjs/common';
import { ProjectLightingDto } from '../dto/project-lighting.dto';
import { IProjectLighting } from '../interfaces/project-lighting.interface';

export const resolveProjectLighting = (
  values: ProjectLightingDto,
  current: IProjectLighting | null = null,
): IProjectLighting => {
  const enabled =
    values.hasGeneralLightingCeilingLowering ??
    current?.hasGeneralLightingCeilingLowering ??
    false;
  const height =
    'generalLightingCeilingLoweringHeight' in values
      ? (values.generalLightingCeilingLoweringHeight ?? null)
      : (current?.generalLightingCeilingLoweringHeight ?? null);
  const isValidHeight =
    typeof height === 'number' && Number.isFinite(height) && height >= 0;
  if (enabled && !isValidHeight) {
    throw new BadRequestException('יש להזין גובה הנמכה מספרי בסנטימטרים');
  }

  return {
    hasGeneralLightingCeilingLowering: enabled,
    generalLightingCeilingLoweringHeight: enabled ? height : null,
  };
};

export const resolveProjectLightingChanges = (
  values: ProjectLightingDto,
  current: IProjectLighting,
): Partial<IProjectLighting> => {
  const hasLightingChanges =
    'hasGeneralLightingCeilingLowering' in values ||
    'generalLightingCeilingLoweringHeight' in values;
  return hasLightingChanges ? resolveProjectLighting(values, current) : {};
};
