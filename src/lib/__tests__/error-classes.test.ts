import { describe, it, expect } from 'vitest';
import { ApiError } from '../api-client';
import { FetchError } from '../fetch-helpers';

describe('Error class unification', () => {
  it('FetchError is the same class as ApiError', () => {
    expect(FetchError).toBe(ApiError);
  });

  it('FetchError instance is instanceof ApiError', () => {
    const err = new FetchError(404, 'not found', '{"error":"missing"}');
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(FetchError);
    expect(err).toBeInstanceOf(Error);
  });

  it('ApiError instance is instanceof FetchError', () => {
    const err = new ApiError(500, 'server error');
    expect(err).toBeInstanceOf(FetchError);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('both preserve status, message, and body', () => {
    const err = new FetchError(429, 'rate limited', '{"retry_after":60}');
    expect(err.status).toBe(429);
    expect(err.message).toBe('rate limited');
    expect(err.body).toBe('{"retry_after":60}');
  });

  it('name is ApiError for both constructors', () => {
    const fetchErr = new FetchError(400, 'bad request');
    const apiErr = new ApiError(400, 'bad request');
    expect(fetchErr.name).toBe('ApiError');
    expect(apiErr.name).toBe('ApiError');
  });
});
