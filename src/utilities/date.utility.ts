import moment from 'moment-timezone';
import { DATE_FORMATS, TIME_UNITS_TEXT, TIME_ZONE } from '@Constants/date';

export const getStartOfToday = (): Date => {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return today;
};

export const getXDaysAgo = (days: number): Date => {
  const date = getStartOfToday();

  date.setDate(date.getDate() - days);

  return date;
};

export const calculateDateDifference = (
  startDate: Date,
  endDate: Date,
): number => {
  const momentStartDate = moment(startDate);
  const momentEndDate = moment(endDate);

  return momentEndDate.diff(momentStartDate, TIME_UNITS_TEXT.DAYS);
};

export const isValidDate = (date: Date | string | number): boolean => {
  const parsed = new Date(date);

  return !isNaN(parsed.getTime());
};

export const formatDate = (
  date?: Date | string | number | null,
  format: string = DATE_FORMATS.HEBREW_FULL_WITH_SLASHES,
): string => {
  if (!date) {
    return '';
  }

  if (!isValidDate(date)) {
    return '';
  }

  return moment(date).tz(TIME_ZONE).format(format);
};
