import dotenv from 'dotenv';

interface IGetValueOptions {
  defaultValue?: string;
  errorOnMissing?: boolean;
}

export class EnvironmentManager {
  private static _isInitialized = false;
  private static properties: Record<string, string> = {};

  public static setup(): void {
    if (this._isInitialized) {
      return;
    }

    const config = dotenv.config();

    if (config.error) {
      return;
    }

    this.properties = config.parsed || {};
    this._isInitialized = true;
  }

  public static get(key: string, options?: IGetValueOptions): string {
    this.setup();

    const value =
      this.properties[key] || process.env[key] || options?.defaultValue || '';

    if (!value && options?.errorOnMissing) {
      throw new Error(`${key} is missing from the environment variables`);
    }

    return value;
  }
}
