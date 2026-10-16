import { chunkItems } from './array.utility';

describe('chunkItems', () => {
  it('splits items into chunks of the given size with a shorter last chunk', () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns no chunks for no items', () => {
    expect(chunkItems([], 40)).toEqual([]);
  });
});
