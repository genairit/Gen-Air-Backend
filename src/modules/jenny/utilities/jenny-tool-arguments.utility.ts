import { isObject } from '@Utilities/object.utility';
import { TJennyToolArguments } from '../interfaces/jenny.interface';

interface IStringArgumentRule {
  name: string;
  minLength: number;
  maxLength: number;
}

export class JennyToolArgumentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = JennyToolArgumentsError.name;
  }
}

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new JennyToolArgumentsError('Tool arguments must be valid JSON');
  }
};

export const parseToolArguments = (raw: string): TJennyToolArguments => {
  if (!raw.trim()) {
    return {};
  }

  const parsed = parseJson(raw);

  if (!isObject(parsed)) {
    throw new JennyToolArgumentsError('Tool arguments must be a JSON object');
  }

  return parsed;
};

export const requireStringArgument = (
  args: TJennyToolArguments,
  rule: IStringArgumentRule,
): string => {
  const value = args[rule.name];
  const text = typeof value === 'string' ? value.trim() : '';
  const isTooShort = text.length < rule.minLength;
  const isTooLong = text.length > rule.maxLength;

  if (isTooShort || isTooLong) {
    throw new JennyToolArgumentsError(
      `${rule.name} must be ${rule.minLength}-${rule.maxLength} characters`,
    );
  }

  return text;
};
