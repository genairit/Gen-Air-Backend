export const hasControlCharacters = (
  text: string,
  allowed: readonly number[] = [],
): boolean => {
  for (const character of text) {
    const code = character.charCodeAt(0);
    if ((code < 32 || code === 127) && !allowed.includes(code)) {
      return true;
    }
  }
  return false;
};
