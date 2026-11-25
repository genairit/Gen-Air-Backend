import { memoizeAsync } from './memoize.utility';

describe('memoizeAsync', () => {
  it('runs the loader once and shares its promise across callers', async () => {
    const load = jest.fn(() => Promise.resolve(['plan.pdf']));
    const memoized = memoizeAsync(load);

    const results = await Promise.all([memoized(), memoized()]);
    await memoized();

    expect(load).toHaveBeenCalledTimes(1);
    expect(results).toEqual([['plan.pdf'], ['plan.pdf']]);
  });

  it('shares a failure instead of retrying within the same memo', async () => {
    const load = jest.fn(() => Promise.reject(new Error('Drive down')));
    const memoized = memoizeAsync(load);

    await expect(memoized()).rejects.toThrow('Drive down');
    await expect(memoized()).rejects.toThrow('Drive down');
    expect(load).toHaveBeenCalledTimes(1);
  });
});
