import type {
  IQuotationView,
  IProjectQuotationView,
} from '../interfaces/quotation-document.interface';

import type {
  IQuotationApartmentLink,
  IQuotationPrimaryProject,
} from '@Modules/quotation-project/interfaces/quotation-project.interface';

import { QUOTATION_PROJECT_ROLE } from '../constants/quotation-sharing.constant';

interface IProjectQuotationSource {
  projectId: string;
  view: IQuotationView;
  apartmentLinks: IQuotationApartmentLink[];
  primaryProject: IQuotationPrimaryProject | null;
}

const toApartmentNumbers = (links: IQuotationApartmentLink[]): string[] =>
  links.flatMap((link) => (link.apartmentNumber ? [link.apartmentNumber] : []));

export const toProjectQuotationView = ({
  view,
  projectId,
  apartmentLinks,
  primaryProject,
}: IProjectQuotationSource): IProjectQuotationView => {
  const sharedLinks = apartmentLinks.filter((link) => link.available);
  const isPrimary = primaryProject?.id === projectId;
  const sharedFromCode = isPrimary ? null : (primaryProject?.code ?? null);

  return {
    ...view,
    sharedFromCode,
    sharedCount: sharedLinks.length,
    sharedApartmentNumbers: toApartmentNumbers(sharedLinks),
    projectRole: isPrimary
      ? QUOTATION_PROJECT_ROLE.PRIMARY
      : QUOTATION_PROJECT_ROLE.SHARED,
  };
};
