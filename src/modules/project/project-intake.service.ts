import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  TProjectIntake,
  IProjectAddress,
  TProjectIntakeInput,
  IProjectIntakeChangeRequest,
} from './interfaces/project.interface';

import {
  EMPTY_CONTACT,
  ADDRESS_CITY_REQUIRED_BY_FIELD_SET,
} from './constants/project-intake.constant';

import { AddressService } from '@Modules/address/address.service';
import { IPlaceAddress } from '@Interfaces/google-places.interface';
import { hasAddressChanges } from './utilities/project-intake.utility';
import { ProjectDetailFieldSetType } from '@Constants/project-detail-field-set.constant';

@Injectable()
export class ProjectIntakeService {
  constructor(private readonly addressService: AddressService) {}

  async resolveForCreate(
    intake: TProjectIntakeInput,
    fieldSet: ProjectDetailFieldSetType,
  ): Promise<TProjectIntake> {
    const contact = { ...EMPTY_CONTACT };
    const address = await this.resolveAddress(
      intake.addressPlaceId ?? null,
      fieldSet,
    );

    return { ...address, ...contact };
  }

  async resolveChanges(
    request: IProjectIntakeChangeRequest,
  ): Promise<Partial<TProjectIntake>> {
    const address = await this.resolveAddressChanges(request);

    return address;
  }

  private async resolveAddressChanges(
    request: IProjectIntakeChangeRequest,
  ): Promise<Partial<IProjectAddress>> {
    const { project, changes, fieldSet } = request;

    if (!fieldSet) {
      return {};
    }

    if (hasAddressChanges(changes)) {
      return this.resolveAddress(changes.addressPlaceId ?? null, fieldSet);
    }

    if (request.isTypeChanging && project.addressPlaceId) {
      this.assertCityWhenRequired(project.addressCity, fieldSet);
    }

    return {};
  }

  private async resolveAddress(
    placeId: string | null,
    fieldSet: ProjectDetailFieldSetType,
  ): Promise<IProjectAddress> {
    if (!placeId) {
      throw new BadRequestException(
        'addressPlaceId is required; pick the address from the suggestions',
      );
    }

    const verifiedAddress = await this.verifyAddress(placeId);

    this.assertCityWhenRequired(verifiedAddress.city, fieldSet);

    return {
      addressPlaceId: placeId,
      addressCity: verifiedAddress.city,
      address: verifiedAddress.formattedAddress,
    };
  }

  private async verifyAddress(placeId: string): Promise<IPlaceAddress> {
    try {
      return await this.addressService.getVerifiedAddress({
        placeId,
        sessionToken: null,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(
          `Address ${placeId} could not be verified with Google; pick it again from the suggestions`,
        );
      }

      throw error;
    }
  }

  private assertCityWhenRequired(
    city: string | null,
    fieldSet: ProjectDetailFieldSetType,
  ): void {
    const isCityRequired = ADDRESS_CITY_REQUIRED_BY_FIELD_SET[fieldSet];

    if (isCityRequired && !city) {
      throw new BadRequestException(
        'This project type needs an address within a city; pick a street address',
      );
    }
  }
}
