import { quotationFilename } from './quotation-filename.utility';

it('uses the saved brand order and omits missing context', () => {
  expect(
    quotationFilename({
      title: 'הצעת מחיר',
      number: 'Q-1',
      customerName: 'לקוח',
      projectCode: null,
      apartmentNumber: null,
      brands: ['תדיראן', 'אלקטרה'],
    }),
  ).toBe('הצעת מחיר Q-1_לקוח_תדיראן-אלקטרה.pdf');
});

it('preserves Hebrew and strips unsafe path characters from each field', () => {
  expect(
    quotationFilename({
      title: 'הצעת מחיר',
      number: 'Q/1',
      customerName: 'אבי_כהן: בע"מ',
      projectCode: '../P\\2',
      apartmentNumber: ' 4? ',
      brands: ['LG|VRF', 'תדיראן*'],
    }),
  ).toBe('הצעת מחיר Q 1_אבי כהן בע מ_P 2_4_LG VRF-תדיראן.pdf');
});
