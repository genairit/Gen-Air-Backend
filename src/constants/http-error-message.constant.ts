import {
  HTTP_ERROR_CODES,
  HttpErrorCodeType,
} from './http-error-code.constant';

export const HTTP_ERROR_MESSAGES = {
  [HTTP_ERROR_CODES.DRIVE_FOLDER_REFERENCE_INVALID]:
    'יש להזין קישור לתיקיית Google Drive או מזהה תיקייה תקין',
  [HTTP_ERROR_CODES.DRIVE_FOLDER_NOT_ACCESSIBLE]:
    'התיקייה לא נמצאה, נמחקה או אינה נגישה לחשבון החברה',
  [HTTP_ERROR_CODES.DRIVE_FOLDER_REQUIRED]:
    'יש לבחור תיקייה ולא קובץ או קיצור דרך',
  [HTTP_ERROR_CODES.DRIVE_FOLDER_OUTSIDE_COMPANY]:
    'יש לבחור תיקייה בתוך תיקיית הפרויקטים של החברה',
  [HTTP_ERROR_CODES.DRIVE_FOLDER_ALREADY_LINKED]:
    'התיקייה כבר משויכת לפרויקט אחר. יש לבחור תיקייה נפרדת',
  [HTTP_ERROR_CODES.DRIVE_FOLDER_OWNERSHIP_OVERLAP]:
    'התיקייה מכילה תיקייה של פרויקט אחר או נמצאת בתוכה. יש לבחור תיקייה נפרדת',
  [HTTP_ERROR_CODES.DRIVE_FOLDER_APARTMENT_LOCATION_INVALID]:
    'יש לבחור תיקיית דירה תחת תיקיית הדיירים של הבניין',
  [HTTP_ERROR_CODES.DRIVE_FOLDER_TEMPLATE_AMBIGUOUS]:
    'נמצאו תיקיות בעלות שם זהה. יש להסדיר את התיקיות לפני המשך הפעולה',
  [HTTP_ERROR_CODES.DRIVE_FOLDER_LINK_NOT_CONFIGURED]:
    'חיבור Google Drive אינו מוגדר. יש לפנות למנהל המערכת',
  [HTTP_ERROR_CODES.DRIVE_AUTHENTICATION_FAILED]:
    'האימות מול Google Drive נכשל. יש לפנות למנהל המערכת',
  [HTTP_ERROR_CODES.DRIVE_FOLDER_CHECK_FAILED]:
    'לא ניתן לבדוק את התיקייה כרגע. יש לנסות שוב',

  [HTTP_ERROR_CODES.INVALID_CURRENT_PASSWORD]: 'Current password is incorrect',
  [HTTP_ERROR_CODES.PROJECT_NAME_ALREADY_EXISTS]:
    'קיים כבר פרויקט בשם זה. יש לבחור שם אחר (ההשוואה תלוית רישיות)',
  [HTTP_ERROR_CODES.INVALID_TEMPLATE]: 'Invalid apartment import template',
  [HTTP_ERROR_CODES.CUSTOMER_NOT_FOUND]: 'Customer was not found',
  [HTTP_ERROR_CODES.CUSTOMER_OWN_CONTACT_MANAGED]:
    'פרטי הקשר הראשיים של הלקוח מתעדכנים בעמוד הלקוח',
  [HTTP_ERROR_CODES.CUSTOMER_CONTACT_NOT_FOUND]:
    'Contact was not found for this customer',
  [HTTP_ERROR_CODES.INVALID_CUSTOMER_CONTACT]:
    'Customer contact details are invalid',
  [HTTP_ERROR_CODES.INVALID_CUSTOMER_PAYMENT_CONFIGURATION]:
    'יש לבחור תנאי תשלום קבועים או שלבי תשלום תקינים בסך 100%',
  [HTTP_ERROR_CODES.DUPLICATE_CUSTOMER_CONTACT]:
    'An identical contact already exists for this customer',
  [HTTP_ERROR_CODES.APARTMENT_IMPORT_FILE_REQUIRED]:
    'One XLSX file is required',
  [HTTP_ERROR_CODES.APARTMENT_IMPORT_BUILDING_NOT_FOUND]:
    'Apartment import building was not found',
  [HTTP_ERROR_CODES.APARTMENT_IMPORT_BUILDING_INVALID]:
    'Apartment import requires an eligible residential building',
  [HTTP_ERROR_CODES.WAITING_REASON_REQUIRED]:
    'יש להזין סיבה למעבר לסטטוס "מחכה לתשובה"',
} as const satisfies Record<HttpErrorCodeType, string>;
