import {
  HEBREW_TEXT,
  MIRRORED_CHARACTERS,
} from '@Constants/hebrew-text.constant';

type TWordPredicate = (word: string) => boolean;

const startsWithAny =
  (letters: string): TWordPredicate =>
  (word) =>
    letters.includes(word.charAt(0));

const endsWithAny =
  (letters: string): TWordPredicate =>
  (word) =>
    letters.includes(word.charAt(word.length - 1));

const countMatching = (words: string[], predicate: TWordPredicate): number =>
  words.filter(predicate).length;

const reverseCharacters = (text: string): string =>
  [...text].reverse().join('');

const mirrorCharacter = (character: string): string =>
  MIRRORED_CHARACTERS[character];

export const isVisualOrderHebrewLine = (line: string): boolean => {
  const words = line.match(HEBREW_TEXT.WORD_PATTERN) ?? [];
  const finalLetterLeads = countMatching(
    words,
    startsWithAny(HEBREW_TEXT.FINAL_LETTERS),
  );
  const finalLetterEndings = countMatching(
    words,
    endsWithAny(HEBREW_TEXT.FINAL_LETTERS),
  );
  const counterpartLeads = countMatching(
    words,
    startsWithAny(HEBREW_TEXT.NON_FINAL_COUNTERPARTS),
  );
  const counterpartEndings = countMatching(
    words,
    endsWithAny(HEBREW_TEXT.NON_FINAL_COUNTERPARTS),
  );
  const reversedEvidence = finalLetterLeads + counterpartEndings;
  const logicalEvidence = finalLetterEndings + counterpartLeads;

  return reversedEvidence > logicalEvidence;
};

export const toLogicalOrderLine = (line: string): string =>
  reverseCharacters(line)
    .replace(HEBREW_TEXT.MIRRORED_CHARACTER_PATTERN, mirrorCharacter)
    .replace(HEBREW_TEXT.LEFT_TO_RIGHT_RUN_PATTERN, reverseCharacters);

const toLogicalOrderLineWhenVisual = (line: string): string => {
  if (!isVisualOrderHebrewLine(line)) {
    return line;
  }

  return toLogicalOrderLine(line);
};

export const fixVisualOrderHebrew = (text: string): string =>
  text
    .split(HEBREW_TEXT.LINE_BREAK)
    .map(toLogicalOrderLineWhenVisual)
    .join(HEBREW_TEXT.LINE_BREAK);
