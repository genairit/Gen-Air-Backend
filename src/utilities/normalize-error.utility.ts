import { isAxiosError } from 'axios';

export class DetailedError extends Error {
  public details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.details = details;
  }
}

export const normalizeError = (error: unknown): Error => {
  if (!error) {
    return new Error('Unknown error');
  }

  if (isAxiosError(error)) {
    return new DetailedError(
      `Axios error: ${error.message} with status code ${error.response?.status}`,
      error.response?.data,
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
};