import {
  resolveNewApartmentLighting,
  resolveApartmentLightingChanges,
} from './apartment-lighting.utility';

import { BadRequestException } from '@nestjs/common';
import { CreateApartmentDto } from '../dto/create-apartment.dto';
import { makeCustomerProjectParent } from '../../../testing/customer-project.fixture';

describe('apartment lighting override', () => {
  const apartment = makeCustomerProjectParent({
    parentProjectId: 'building-id',
    hasOwnLighting: false,
  });

  it('creates an inherited apartment without copying building values', () => {
    expect(resolveNewApartmentLighting({} as CreateApartmentDto)).toEqual({
      hasOwnLighting: false,
      hasGeneralLightingCeilingLowering: false,
      generalLightingCeilingLoweringHeight: null,
    });
  });

  it('creates a local off override independently of the building', () => {
    expect(
      resolveNewApartmentLighting({
        hasOwnLighting: true,
      } as CreateApartmentDto),
    ).toEqual({
      hasOwnLighting: true,
      hasGeneralLightingCeilingLowering: false,
      generalLightingCeilingLoweringHeight: null,
    });
  });

  it('requires a valid height for an enabled local override', () => {
    expect(() =>
      resolveNewApartmentLighting({
        hasOwnLighting: true,
        hasGeneralLightingCeilingLowering: true,
      } as CreateApartmentDto),
    ).toThrow(BadRequestException);
    expect(
      resolveNewApartmentLighting({
        hasOwnLighting: true,
        hasGeneralLightingCeilingLowering: true,
        generalLightingCeilingLoweringHeight: 0,
      } as CreateApartmentDto).generalLightingCeilingLoweringHeight,
    ).toBe(0);
  });

  it('rejects local values paired with an inherited mode', () => {
    expect(() =>
      resolveNewApartmentLighting({
        hasOwnLighting: false,
        hasGeneralLightingCeilingLowering: false,
      } as CreateApartmentDto),
    ).toThrow(BadRequestException);
  });

  it('resets an apartment to live building inheritance', () => {
    expect(
      resolveApartmentLightingChanges(
        { hasOwnLighting: false },
        {
          ...apartment,
          hasOwnLighting: true,
          hasGeneralLightingCeilingLowering: true,
          generalLightingCeilingLoweringHeight: 25,
        },
      ),
    ).toEqual({
      hasOwnLighting: false,
      hasGeneralLightingCeilingLowering: false,
      generalLightingCeilingLoweringHeight: null,
    });
  });

  it('preserves the existing local height when only the flag is resent', () => {
    expect(
      resolveApartmentLightingChanges(
        {
          hasGeneralLightingCeilingLowering: true,
        },
        {
          ...apartment,
          hasOwnLighting: true,
          hasGeneralLightingCeilingLowering: true,
          generalLightingCeilingLoweringHeight: 25.5,
        },
      ),
    ).toMatchObject({
      hasOwnLighting: true,
      generalLightingCeilingLoweringHeight: 25.5,
    });
  });

  it('leaves lighting storage untouched for unrelated edits', () => {
    expect(
      resolveApartmentLightingChanges({ notes: 'updated' }, apartment),
    ).toEqual({});
  });
});
