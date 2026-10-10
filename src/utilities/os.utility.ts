import os from 'node:os';

const PLATFORM_OPTIONS: { [key: string]: string } = {
  linux: 'linux',
  darwin: 'macos',
  win32: 'windows',
};

export class OS {
  private static os: string = os.platform();

  public static getPlatform(): string {
    return PLATFORM_OPTIONS[this.os] || 'unknown';
  }

  public static isLinux(): boolean {
    return this.os === PLATFORM_OPTIONS.linux;
  }

  public static isMacOS(): boolean {
    return this.os === PLATFORM_OPTIONS.darwin;
  }

  public static isWindows(): boolean {
    return this.os === PLATFORM_OPTIONS.win32;
  }
}