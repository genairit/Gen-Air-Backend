import { Transform } from 'class-transformer';

export const NullIfBlank = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );
