export const chunkItems = <T>(items: T[], chunkSize: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / chunkSize) }, (_, index) =>
    items.slice(index * chunkSize, (index + 1) * chunkSize),
  );

export const uniqueBy = <T>(items: T[], keyOf: (item: T) => string): T[] => [
  ...new Map(items.map((item) => [keyOf(item), item])).values(),
];
