interface IQuotationFilenameContext {
  title: string;
  number: string;
  brands: string[];
  customerName: string;
  projectCode: string | null;
  apartmentNumber: string | null;
}

const safeSegment = (value: string): string =>
  value
    .normalize('NFC')
    .replace(/[<>:"/\\|?*_\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[. ]+|[. ]+$/gu, '');

export const quotationFilename = ({
  title,
  number,
  customerName,
  projectCode,
  apartmentNumber,
  brands,
}: IQuotationFilenameContext): string => {
  const brandNames = brands.map(safeSegment).filter(Boolean).join('-');
  const segments = [
    `${title} ${number}`,
    customerName,
    projectCode,
    apartmentNumber,
    brandNames,
  ];

  return `${segments
    .filter((segment): segment is string => segment !== null)
    .map(safeSegment)
    .filter(Boolean)
    .join('_')}.pdf`;
};
