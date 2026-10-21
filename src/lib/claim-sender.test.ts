import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { checkAgain, ClaimNotSavedError, submitClaim } from '@/lib/claim-sender';
import { currentBucket, readRecords } from '@/lib/claim-store';
import { setToken } from '@/lib/token';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

const CLAIM = {
  id: 'clm_1',
  asset: 'ETH',
  amount: '0.5',
  fee: '0.0012',
  receiveAmount: '0.4988',
  destinationId: 'dest_wallet',
  status: 'pending',
  failureReason: null,
  createdAt: '2026-10-21T06:00:07.000Z',
  updatedAt: '2026-10-21T06:00:07.000Z',
};

const INPUT = {
  asset: 'ETH',
  amount: '0.5',
  destinationId: 'dest_wallet',
  destinationLabel: 'Wallet',
  fee: '0.0012',
  receiveAmount: '0.4988',
};

// jsdom has no Response; this is the part of it api.ts uses.
const json = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  }) as unknown as Response;

type FetchArgs = [string, RequestInit];
let fetchMock: jest.Mock<(...args: FetchArgs) => Promise<Response>>;

function sentRequests() {
  return fetchMock.mock.calls.map(([, init]) => ({
    key: (init.headers as Record<string, string>)['Idempotency-Key'],
    body: init.body,
  }));
}

function record(key: string) {
  return readRecords(currentBucket()!).find((r) => r.key === key)!;
}

/** Lets pending promises (fetch, response.json) settle. */
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

let tokenCounter = 0;

beforeEach(() => {
  jest.useFakeTimers();
  // A fresh token per test gives each test its own claim bucket.
  setToken(`test-token-${++tokenCounter}`);
  fetchMock = jest.fn<(...args: FetchArgs) => Promise<Response>>();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('submitClaim', () => {
  it('saves the claim before sending it', async () => {
    fetchMock.mockResolvedValue(json(201, CLAIM));
    const key = submitClaim(INPUT);
    expect(record(key).state).toBe('checking');
    await flush();
    expect(record(key).state).toBe('created');
    expect(record(key).claim?.id).toBe('clm_1');
  });

  it('retries an unknown outcome with the same key and the same body', async () => {
    fetchMock
      .mockResolvedValueOnce(json(504, { error: { code: 'TIMEOUT', message: 'timeout' } }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(200, CLAIM));
    const key = submitClaim(INPUT);
    await flush();
    expect(record(key).state).toBe('checking');
    expect(record(key).uncertain).toBe(true);

    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    await flush();

    expect(record(key).state).toBe('created');
    const sent = sentRequests();
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((s) => s.key))).toEqual(new Set([key]));
    expect(new Set(sent.map((s) => s.body))).toEqual(
      new Set([JSON.stringify({ asset: 'ETH', amount: '0.5', destinationId: 'dest_wallet' })]),
    );
  });

  it('treats a 400 as refused: nothing created, no retry', async () => {
    fetchMock.mockResolvedValue(
      json(400, { error: { code: 'VALIDATION', message: 'Amount exceeds available', field: 'amount' } }),
    );
    const key = submitClaim(INPUT);
    await flush();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(record(key).state).toBe('rejected');
    expect(record(key).errorField).toBe('amount');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a claim checking on 401 and does not retry by itself', async () => {
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHORIZED', message: 'nope' } }));
    const key = submitClaim(INPUT);
    await flush();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(record(key).state).toBe('checking');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops retrying after the 2 minute window, then Check again tries once more', async () => {
    fetchMock.mockResolvedValue(json(503, { error: { code: 'SERVER', message: 'down' } }));
    const key = submitClaim(INPUT);
    await flush();
    await jest.advanceTimersByTimeAsync(130_000);
    expect(record(key).state).toBe('stalled');
    const calls = fetchMock.mock.calls.length;

    fetchMock.mockResolvedValue(json(200, CLAIM));
    await checkAgain(key);
    expect(fetchMock.mock.calls.length).toBe(calls + 1);
    expect(record(key).state).toBe('created');
  });

  it('sends nothing if the claim cannot be saved', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(() => submitClaim(INPUT)).toThrow(ClaimNotSavedError);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });

  it('never sends a claim with a different token', async () => {
    fetchMock.mockResolvedValueOnce(json(503, { error: { code: 'SERVER', message: 'down' } }));
    submitClaim(INPUT);
    await flush();
    setToken('someone-elses-token');
    await jest.advanceTimersByTimeAsync(130_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
