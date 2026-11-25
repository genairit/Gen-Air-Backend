import { TIME_UNITS } from '@Constants/time.constant';
import { withAbort, remainingUntil, signalWithTimeout } from './abort.utility';

const ABORT_DELAY_MS = 10;

describe('withAbort', () => {
  it('resolves with the operation result while the signal stays active', async () => {
    await expect(
      withAbort(Promise.resolve('done'), new AbortController().signal),
    ).resolves.toBe('done');
  });

  it('propagates the operation failure', async () => {
    await expect(
      withAbort(
        Promise.reject(new Error('failed')),
        new AbortController().signal,
      ),
    ).rejects.toThrow('failed');
  });

  it('refuses to start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already aborted'));

    await expect(
      withAbort(Promise.resolve('late'), controller.signal),
    ).rejects.toThrow('already aborted');
  });

  it('rejects with the abort reason when the signal fires first', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('deadline')), ABORT_DELAY_MS);

    await expect(
      withAbort(new Promise(() => {}), controller.signal),
    ).rejects.toThrow('deadline');
  });

  it('wraps a non-error abort reason in an error', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort('stop'), ABORT_DELAY_MS);

    await expect(
      withAbort(new Promise(() => {}), controller.signal),
    ).rejects.toThrow('Operation was aborted');
  });
});

describe('remainingUntil', () => {
  it('returns the milliseconds left before a deadline', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);

    expect(remainingUntil(1250)).toBe(250);
    expect(remainingUntil(900)).toBe(0);

    jest.restoreAllMocks();
  });
});

describe('signalWithTimeout', () => {
  it('aborts when the parent signal aborts', () => {
    const parent = new AbortController();
    const signal = signalWithTimeout(parent.signal, TIME_UNITS.MINUTE_MS);

    parent.abort();

    expect(signal.aborted).toBe(true);
  });

  it('aborts on its own timeout', async () => {
    const signal = signalWithTimeout(
      new AbortController().signal,
      ABORT_DELAY_MS,
    );

    await new Promise((resolve) => setTimeout(resolve, ABORT_DELAY_MS * 3));

    expect(signal.aborted).toBe(true);
  });
});
