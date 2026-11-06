export interface IQuotationEmailTemplateValues {
  senderName: string;
  projectName: string;
  planVersion: string;
  architectName: string;
  apartmentNumber: string;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );

export const renderQuotationExecutionEmail = (
  values: IQuotationEmailTemplateValues,
) => {
  const subject = `${values.projectName} | ${values.apartmentNumber} | ${values.architectName} | תוכנית מיזוג אוויר לביצוע`;
  const text = [
    'שלום,',
    `מצורפת תוכנית מיזוג אוויר לביצוע עבור דירה ${values.apartmentNumber}`,
    `גרסת תוכנית ${values.planVersion}`,
    'למייל מצורפים:',
    '1. תוכנית מיזוג אוויר לביצוע',
    '2. קובץ zip',
    'במידה ויהיה עדכון על התוכניות הנ״ל אשלח כתשובה למייל זה',
    'בברכה,',
    values.senderName,
  ].join('\n');
  const apartment = escapeHtml(values.apartmentNumber);
  const version = escapeHtml(values.planVersion);
  const sender = escapeHtml(values.senderName);
  const html = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#ffffff;color:#0f172a;font-family:Arial,sans-serif"><main style="max-width:640px;padding:28px;line-height:1.7"><p>שלום,</p><p>מצורפת תוכנית מיזוג אוויר לביצוע עבור דירה ${apartment}<br>גרסת תוכנית ${version}</p><p>למייל מצורפים:<br>1. תוכנית מיזוג אוויר לביצוע<br>2. קובץ zip</p><p>במידה ויהיה עדכון על התוכניות הנ״ל אשלח כתשובה למייל זה</p><p>בברכה,</p><div style="border-right:3px solid #1668bd;padding-right:14px"><img src="cid:genair-logo@genair" width="180" alt="GenAir" style="display:block;max-width:100%;height:auto"><div style="font-weight:700;color:#0f172a;margin-top:7px">${sender}</div></div></main></body></html>`;
  return { subject, text, html };
};
