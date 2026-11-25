import { uniqueBy, chunkItems } from './array.utility';

describe('chunkItems', () => {
  it('splits items into chunks of the given size with a shorter last chunk', () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns no chunks for no items', () => {
    expect(chunkItems([], 40)).toEqual([]);
  });
});

describe('uniqueBy', () => {
  it('keeps one item per key in first-seen order', () => {
    const items = [
      { id: 'a', page: 1 },
      { id: 'b', page: 2 },
      { id: 'a', page: 1 },
    ];

    expect(uniqueBy(items, (item) => item.id)).toEqual([
      { id: 'a', page: 1 },
      { id: 'b', page: 2 },
    ]);
  });
});
