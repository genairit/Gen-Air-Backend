import colors from 'ansi-colors';

export enum LogColor {
  red = 'red',
  blue = 'blue',
  cyan = 'cyan',
  white = 'white',
  green = 'green',
  yellow = 'yellow',
  magenta = 'magenta',
}

export const COLOR_WRAPPERS = {
  [LogColor.red]: colors.red,
  [LogColor.blue]: colors.blue,
  [LogColor.cyan]: colors.cyan,
  [LogColor.white]: colors.white,
  [LogColor.green]: colors.green,
  [LogColor.yellow]: colors.yellow,
  [LogColor.magenta]: colors.magenta,
};

export const DEFAULT_LOG_COLOR = LogColor.white;
