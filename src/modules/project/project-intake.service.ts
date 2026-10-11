import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import {
  TProjectIntake,
  IProjectAddress,
  IProjectContact,
  TProjectIntakeInput,
  IProjectPaymentTerms,
  IProjectIntakeChangeRequest,
} from './interfaces/project.interface';

import {
  mergeContact,
  hasAddressChanges,
  hasContactChanges,
  mergePaymentTerms,
  hasPaymentTermsChanges,
  findMissingContactFields,
} from './utilities/project-intake.utility';

import {
  PAYMENT_TERMS_BY_FIELD_SET,
  ADDRESS_CITY_REQUIRED_BY_FIELD_SET,
} from './constants/project-intake.constant';

import { PAYMENT_TERMS } from '@Constants/payment-terms.constant';
import { AddressService } from '@Modules/address/address.service';
import { IPlaceAddress } from '@Interfaces/google-places.interface';
import { ProjectDetailFieldSetType } from '@Constants/project-detail-field-set.constant';

@Injectable()
export class ProjectIntakeService {
  constructor(private readonly addressService: AddressService) {}

  async resolveForCreate(
    intake: TProjectIntakeInput,
    fieldSet: ProjectDetailFieldSetType,
  ): Promise<TProjectIntake> {
    const contact = this.requireCompleteContact(mergeContact({}, intake));
    const paymentTerms = this.resolvePaymentTerms(
      mergePaymentTerms({}, intake),
      fieldSet,
    );
    const address = await this.resolveAddress(
      intake.addressPlaceId ?? null,
      fieldSet,
    );

    return { ...address, ...contact, ...paymentTerms };
  }

  async resolveChanges(
    request: IProjectIntakeChangeRequest,
  ): Promise<Partial<TProjectIntake>> {
    const contact = this.resolveContactChanges(request);
    const paymentTerms = this.resolvePaymentTermsChanges(request);
    const address = await this.resolveAddressChanges(request);

    return { ...address, ...contact, ...paymentTerms };
  }

  private resolveContactChanges({
    project,
    changes,
  }: IProjectIntakeChangeRequest): Partial<IProjectContact> {
    if (!hasContactChanges(changes)) {
      return {};
    }

    return this.requireCompleteContact(mergeContact(project, changes));
  }

  private resolvePaymentTermsChanges(
    request: IProjectIntakeChangeRequest,
  ): Partial<IProjectPaymentTerms> {
    const { project, changes, fieldSet } = request;
    const isChangingTerms = hasPaymentTermsChanges(changes);
    const paymentTerms = mergePaymentTerms(project, changes);
    const isLegacyWithoutTerms = !isChangingTerms && !paymentTerms.paymentTerms;

    if (!fieldSet || isLegacyWithoutTerms) {
      return {};
    }

    if (!isChangingTerms && !request.isTypeChanging) {
      return {};
    }

    return this.resolvePaymentTerms(paymentTerms, fieldSet);
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

  private requireCompleteContact(contact: IProjectContact): IProjectContact {
    const missingFields = findMissingContactFields(contact);

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Missing contact person details: ${missingFields.join(', ')}`,
      );
    }

    return contact;
  }

  private resolvePaymentTerms(
    { paymentTerms, paymentTermsNote }: IProjectPaymentTerms,
    fieldSet: ProjectDetailFieldSetType,
  ): IProjectPaymentTerms {
    if (!paymentTerms) {
      throw new BadRequestException('paymentTerms is required');
    }

    const allowedTerms = PAYMENT_TERMS_BY_FIELD_SET[fieldSet];

    if (!allowedTerms.includes(paymentTerms)) {
      throw new BadRequestException(
        `Payment terms "${paymentTerms}" are not available for this project type; choose one of: ${allowedTerms.join(', ')}`,
      );
    }

    if (paymentTerms !== PAYMENT_TERMS.OTHER) {
      return { paymentTerms, paymentTermsNote: null };
    }

    if (!paymentTermsNote) {
      throw new BadRequestException(
        'paymentTermsNote is required when paymentTerms is "other"',
      );
    }

    return { paymentTerms, paymentTermsNote };
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
