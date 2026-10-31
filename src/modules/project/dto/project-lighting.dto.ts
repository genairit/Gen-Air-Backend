import {
  Min,
  IsNumber,
  IsBoolean,
  IsOptional,
  ValidateIf,
} from 'class-validator';

export class ProjectLightingDto {
  @ValidateIf((value: object) => 'hasGeneralLightingCeilingLowering' in value)
  @IsBoolean()
  declare hasGeneralLightingCeilingLowering?: boolean;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  declare generalLightingCeilingLoweringHeight?: number | null;
}
