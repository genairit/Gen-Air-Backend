import {
  resolveProjectLighting,
  resolveProjectLightingChanges,
} from './project-lighting.utility';

import { BadRequestException } from '@nestjs/common';
import { IProjectLighting } from '../interfaces/project-lighting.interface';

const enabledLighting: IProjectLighting = {
  hasGeneralLightingCeilingLowering: true,
  generalLightingCeilingLoweringHeight: 25.5,
};
const disabledLighting: IProjectLighting = {
  hasGeneralLightingCeilingLowering: false,
  generalLightingCeilingLoweringHeight: null,
};

describe('project lighting persistence rules', () => {
  it('defaults existing or omitted lighting settings to disabled with no height', () => {
    expect(resolveProjectLighting({})).toEqual(disabledLighting);
  });

  it.each([0, 0.5, 25, 25.125, 1_000_000])(
    'preserves finite numeric centimeters without an arbitrary upper business bound: %s',
    (height) => {
      expect(
        resolveProjectLighting({
          hasGeneralLightingCeilingLowering: true,
          generalLightingCeilingLoweringHeight: height,
        }),
      ).toEqual({
        hasGeneralLightingCeilingLowering: true,
        generalLightingCeilingLoweringHeight: height,
      });
    },
  );

  it.each([
    null,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects an enabled setting with invalid height %p', (height) => {
    expect(() =>
      resolveProjectLighting({
        hasGeneralLightingCeilingLowering: true,
        generalLightingCeilingLoweringHeight: height,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects enabling lighting without an existing or submitted height', () => {
    expect(() =>
      resolveProjectLighting({ hasGeneralLightingCeilingLowering: true }),
    ).toThrow(BadRequestException);
  });

  it('clears the persisted height when the toggle is disabled', () => {
    expect(
      resolveProjectLightingChanges(
        { hasGeneralLightingCeilingLowering: false },
        enabledLighting,
      ),
    ).toEqual(disabledLighting);
  });

  it('does not retain a submitted height while disabled', () => {
    expect(
      resolveProjectLighting({
        hasGeneralLightingCeilingLowering: false,
        generalLightingCeilingLoweringHeight: 25,
      }),
    ).toEqual(disabledLighting);
  });

  it('keeps an existing height when an enabled toggle is submitted alone', () => {
    expect(
      resolveProjectLightingChanges(
        { hasGeneralLightingCeilingLowering: true },
        enabledLighting,
      ),
    ).toEqual(enabledLighting);
  });

  it('merges a height-only patch with the existing enabled state', () => {
    expect(
      resolveProjectLightingChanges(
        { generalLightingCeilingLoweringHeight: 0 },
        enabledLighting,
      ),
    ).toEqual({
      hasGeneralLightingCeilingLowering: true,
      generalLightingCeilingLoweringHeight: 0,
    });
  });

  it('rejects clearing the height while the stored toggle stays enabled', () => {
    expect(() =>
      resolveProjectLightingChanges(
        { generalLightingCeilingLoweringHeight: null },
        enabledLighting,
      ),
    ).toThrow(BadRequestException);
  });

  it('does not change stored lighting values in an unrelated patch', () => {
    const previous = { ...enabledLighting };
    expect(resolveProjectLightingChanges({}, enabledLighting)).toEqual({});
    expect(enabledLighting).toEqual(previous);
  });
});
