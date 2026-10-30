import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationCancelledError, OperationTimeoutError, withTimeout } from './async';

afterEach(() => { vi.useRealTimers(); });

describe('withTimeout', () => {
  it('resolves with the value when the operation settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1_000, 'test')).resolves.toBe(42);
  });

  it('rejects with OperationTimeoutError when the operation never settles', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => {}), 10_000, 'Audio startup');
    vi.advanceTimersByTime(10_000);
    await expect(pending).rejects.toBeInstanceOf(OperationTimeoutError);
  });

  it('rejects with OperationCancelledError when aborted', async () => {
    const controller = new AbortController();
    const pending = withTimeout(new Promise<never>(() => {}), 10_000, 'Audio startup', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(OperationCancelledError);
  });

  it('disposes a value that resolves after the timeout', async () => {
    vi.useFakeTimers();
    let resolveLate: (value: string) => void = () => {};
    const onLateResolve = vi.fn();
    const pending = withTimeout(new Promise<string>((resolve) => { resolveLate = resolve; }), 100, 'test', { onLateResolve });
    vi.advanceTimersByTime(100);
    await expect(pending).rejects.toBeInstanceOf(OperationTimeoutError);
    resolveLate('stream');
    await Promise.resolve();
    expect(onLateResolve).toHaveBeenCalledWith('stream');
  });

  it('propagates operation errors', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1_000, 'test')).rejects.toThrow('boom');
  });
});

it('cleans up an operation that resolves when its signal was already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  const cleanup = vi.fn();
  await expect(withTimeout(Promise.resolve('stream'), 1000, 'Microphone', { signal: controller.signal, onLateResolve: cleanup })).rejects.toBeInstanceOf(OperationCancelledError);
  await Promise.resolve();
  expect(cleanup).toHaveBeenCalledWith('stream');
});
