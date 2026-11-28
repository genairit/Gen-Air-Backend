export interface IQuotationPdfLine {
  sku: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  description: string;
  capacityBtu: number | null;
}
export interface IQuotationPdfSection {
  title: string;
  brand: string | null;
  floorId?: string | null;
  floorName?: string | null;
  lines: IQuotationPdfLine[];
}
