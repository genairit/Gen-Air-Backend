import {
  Min,
  IsIn,
  IsInt,
  IsUUID,
  IsEmail,
  Matches,
  IsString,
  MaxLength,
  IsBoolean,
  MinLength,
  IsOptional,
} from 'class-validator';

import {
  SUPPLIER_CURRENCIES,
  SUPPLIER_DATE_PATTERN,
  SUPPLIER_PRICE_PATTERN,
  SUPPLIER_QUANTITY_PATTERN,
} from '../constants/supplier-agreement.constant';

export class SupplierDetailsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  declare name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  declare contactName?: string | null;

  @IsOptional()
  @Matches(/^[+0-9 ()-]{6,32}$/)
  declare phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  declare email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  declare notes?: string;

  @IsOptional()
  @IsBoolean()
  declare active?: boolean;
}

export class UpdateSupplierDto extends SupplierDetailsDto {
  @IsInt()
  @Min(1)
  declare expectedVersion: number;
}

export class AgreementTermsDto {
  @Matches(SUPPLIER_PRICE_PATTERN)
  declare unitPrice: string;

  @IsIn(SUPPLIER_CURRENCIES)
  declare currencyCode: (typeof SUPPLIER_CURRENCIES)[number];

  @IsOptional()
  @Matches(SUPPLIER_QUANTITY_PATTERN)
  declare agreedQuantity?: string | null;

  @IsOptional()
  @Matches(SUPPLIER_DATE_PATTERN)
  declare effectiveFrom?: string | null;

  @IsOptional()
  @Matches(SUPPLIER_DATE_PATTERN)
  declare effectiveThrough?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  declare notes?: string;

  @IsOptional()
  @IsBoolean()
  declare active?: boolean;
}

export class CreateAgreementDto extends AgreementTermsDto {
  @IsUUID()
  declare boqLineId: string;

  @IsUUID()
  declare supplierId: string;
}

export class UpdateAgreementDto extends AgreementTermsDto {
  @IsInt()
  @Min(1)
  declare expectedVersion: number;
}
