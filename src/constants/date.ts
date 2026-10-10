export const TIME_ZONE = 'Asia/Jerusalem';

export const TIME_UNITS = {
  SECONDS: 1000,
  MINUTES: 1000 * 60,
  HOURS: 1000 * 60 * 60,
  DAYS: 1000 * 60 * 60 * 24,
  WEEKS: 1000 * 60 * 60 * 24 * 7,
  MONTHS: 1000 * 60 * 60 * 24 * 30,
  YEARS: 1000 * 60 * 60 * 24 * 365,
};

export const DATE_FORMATS = {
  XML_DATE: 'YYYY-MM-DD',
  HOURS_AND_MINUTES: 'HH:mm',
  FILENAME: 'YYYY-MM-DD-HH-mm-ss',
  FULL_WITH_SLASHES: 'YYYY/MM/DD',
  HEBREW_FULL_WITH_SLASHES: 'DD/MM/YYYY',
  XML_DATE_TIME: 'YYYY-MM-DDTHH:mm:ss.SSS',
};

export const TIME_UNITS_TEXT = {
  SECONDS: 'seconds',
  MINUTES: 'minutes',
  HOURS: 'hours',
  DAYS: 'days',
  WEEKS: 'weeks',
  MONTHS: 'months',
  YEARS: 'years',
} as const;
