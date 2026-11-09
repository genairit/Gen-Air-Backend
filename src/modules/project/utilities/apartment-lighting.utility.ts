import { BadRequestException } from '@nestjs/common';
import { IProject } from '../interfaces/project.interface';
import { UpdateProjectDto } from '../dto/update-project.dto';
import { CreateApartmentDto } from '../dto/create-apartment.dto';
import { resolveProjectLighting } from './project-lighting.utility';
import { IProjectLighting } from '../interfaces/project-lighting.interface';

type TApartmentLighting = IProjectLighting & { hasOwnLighting: boolean };

const hasLightingValues = (values: UpdateProjectDto | CreateApartmentDto) =>
  'hasGeneralLightingCeilingLowering' in values ||
  'generalLightingCeilingLoweringHeight' in values;

export const resolveNewApartmentLighting = (
  values: CreateApartmentDto,
): TApartmentLighting => {
  const hasOwnLighting = values.hasOwnLighting ?? hasLightingValues(values);
  if (!hasOwnLighting && hasLightingValues(values)) {
    throw new BadRequestException(
      'Inherited apartment lighting cannot include local values',
    );
  }

  return {
    hasOwnLighting,
    ...resolveProjectLighting(hasOwnLighting ? values : {}),
  };
};

export const resolveApartmentLightingChanges = (
  values: UpdateProjectDto,
  apartment: IProject,
): Partial<TApartmentLighting> => {
  const hasChanges = 'hasOwnLighting' in values || hasLightingValues(values);
  if (!hasChanges) {
    return {};
  }

  if (values.hasOwnLighting === false) {
    if (hasLightingValues(values)) {
      throw new BadRequestException(
        'Resetting apartment lighting cannot include local values',
      );
    }

    return {
      hasOwnLighting: false,
      hasGeneralLightingCeilingLowering: false,
      generalLightingCeilingLoweringHeight: null,
    };
  }

  return {
    hasOwnLighting: true,
    ...resolveProjectLighting(
      values,
      apartment.hasOwnLighting ? apartment : null,
    ),
  };
};
