import { createHash } from 'node:crypto';
import { isPublicationRecord } from './publication-result.utility';

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item: unknown): unknown => canonicalValue(item));
  }

  if (isPublicationRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key): [string, unknown] => [key, canonicalValue(value[key])]),
    );
  }

  return value;
};
export const publicationSnapshotJson = (snapshot: object): string => {
  const normalized: unknown = JSON.parse(JSON.stringify(snapshot));
  return JSON.stringify(canonicalValue(normalized));
};
export const publicationSnapshotHash = (snapshot: object): string =>
  createHash('sha256').update(publicationSnapshotJson(snapshot)).digest('hex');
