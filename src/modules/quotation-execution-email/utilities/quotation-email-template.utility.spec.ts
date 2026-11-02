import { renderQuotationExecutionEmail } from './quotation-email-template.utility';

describe('renderQuotationExecutionEmail', () => {
  it('renders the required Hebrew content and escaped HTML with the inline GenAir signature', () => {
    const result = renderQuotationExecutionEmail({
      projectName: 'North',
      apartmentNumber: '12',
      architectName: 'A',
      planVersion: '<03>',
      senderName: 'Dana & Co',
    });
    expect(result.subject).toBe('North | 12 | A | תוכנית מיזוג אוויר לביצוע');
    expect(result.text).toContain('שלום,\nמצורפת');
    expect(result.text).toContain('גרסת תוכנית <03>');
    expect(result.html).toContain('גרסת תוכנית &lt;03&gt;');
    expect(result.html).toContain('Dana &amp; Co');
    expect(result.html).toContain('cid:genair-logo@genair');
  });
});
