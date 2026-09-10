import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isQuotaExceededError,
  StorageAlertDispatcher,
  storageAlertDispatcher,
  type StorageQuotaAlertEvent,
} from '../storage_alert';
import type { ILogger } from '../../telemetry';

describe('isQuotaExceededError (MIN-029)', () => {
  it('returns false for null, undefined, and non-object primitives', () => {
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError(undefined)).toBe(false);
    expect(isQuotaExceededError('')).toBe(false);
    expect(isQuotaExceededError('QuotaExceededError')).toBe(false);
    expect(isQuotaExceededError(0)).toBe(false);
    expect(isQuotaExceededError(22)).toBe(false);
    expect(isQuotaExceededError(true)).toBe(false);
  });

  describe('DOMException instances', () => {
    it('identifies W3C standard QuotaExceededError by code 22', () => {
      const err = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      expect(isQuotaExceededError(err)).toBe(true);
    });

    it('identifies W3C standard QuotaExceededError by name', () => {
      const err = new DOMException('Quota exceeded', 'QuotaExceededError');
      expect(isQuotaExceededError(err)).toBe(true);
    });

    it('identifies Firefox legacy NS_ERROR_DOM_QUOTA_REACHED by name', () => {
      const err = new DOMException('Quota reached', 'NS_ERROR_DOM_QUOTA_REACHED');
      expect(isQuotaExceededError(err)).toBe(true);
    });

    it('identifies Firefox legacy NS_ERROR_DOM_QUOTA_REACHED by code 1014', () => {
      const err = new DOMException('Legacy error', 'UnknownError');
      Object.defineProperty(err, 'code', { value: 1014 });
      expect(isQuotaExceededError(err)).toBe(true);
    });

    it('returns false for unrelated DOMExceptions', () => {
      const notFoundErr = new DOMException('Item not found', 'NotFoundError');
      expect(isQuotaExceededError(notFoundErr)).toBe(false);

      const syntaxErr = new DOMException('Syntax error', 'SyntaxError');
      expect(isQuotaExceededError(syntaxErr)).toBe(false);
    });
  });

  describe('Generic error objects & polyfills', () => {
    it('identifies generic error with name QuotaExceededError', () => {
      const err = new Error('Quota exceeded');
      err.name = 'QuotaExceededError';
      expect(isQuotaExceededError(err)).toBe(true);
    });

    it('identifies generic error with name NS_ERROR_DOM_QUOTA_REACHED', () => {
      const err = { name: 'NS_ERROR_DOM_QUOTA_REACHED' };
      expect(isQuotaExceededError(err)).toBe(true);
    });

    it('identifies generic error with code 22', () => {
      const err = { code: 22, message: 'Storage full' };
      expect(isQuotaExceededError(err)).toBe(true);
    });

    it('identifies generic error with code 1014', () => {
      const err = { code: 1014, message: 'Gecko storage full' };
      expect(isQuotaExceededError(err)).toBe(true);
    });

    it('identifies generic error with message containing QuotaExceededError', () => {
      const err = new Error('Failed to execute setItem on Storage: QuotaExceededError');
      expect(isQuotaExceededError(err)).toBe(true);
    });

    it('returns false for generic errors without quota indicators', () => {
      const err = new Error('Something else went wrong');
      expect(isQuotaExceededError(err)).toBe(false);

      const genericObj = { foo: 'bar', code: 404 };
      expect(isQuotaExceededError(genericObj)).toBe(false);
    });
  });
});

describe('StorageAlertDispatcher (MIN-029)', () => {
  let mockLogger: ILogger;
  let dispatcher: StorageAlertDispatcher;

  const mockEvent: StorageQuotaAlertEvent = {
    type: 'STORAGE_QUOTA_EXCEEDED',
    store: 'puzzles',
    attemptedAction: 'save',
    timestamp: 1789025000000,
    message: 'Local storage quota exceeded while saving puzzle progress',
    suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
  };

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
    };
    dispatcher = new StorageAlertDispatcher(mockLogger);
  });

  it('notifies subscribed listeners with the storage alert event', () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    dispatcher.subscribe(listenerA);
    dispatcher.subscribe(listenerB);

    dispatcher.notify(mockEvent);

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerA).toHaveBeenCalledWith(mockEvent);
    expect(listenerB).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledWith(mockEvent);
  });

  it('unsubscribes listeners via the returned teardown callback', () => {
    const listener = vi.fn();
    const unsubscribe = dispatcher.subscribe(listener);

    dispatcher.notify(mockEvent);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    dispatcher.notify(mockEvent);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('handles and isolates listener exceptions, continuing notification to other listeners', () => {
    const faultyListener = vi.fn(() => {
      throw new Error('Listener crashed');
    });
    const healthyListener = vi.fn();

    dispatcher.subscribe(faultyListener);
    dispatcher.subscribe(healthyListener);

    expect(() => dispatcher.notify(mockEvent)).not.toThrow();

    expect(faultyListener).toHaveBeenCalledTimes(1);
    expect(healthyListener).toHaveBeenCalledTimes(1);
    expect(healthyListener).toHaveBeenCalledWith(mockEvent);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error in storage alert listener',
      expect.objectContaining({
        operation: 'storage_alert_notify',
        error: expect.objectContaining({
          message: 'Listener crashed',
        }),
      })
    );
  });

  it('handles non-Error exceptions in listener gracefully', () => {
    const stringThrowListener = vi.fn(() => {
      throw 'Raw string error';
    });

    dispatcher.subscribe(stringThrowListener);
    expect(() => dispatcher.notify(mockEvent)).not.toThrow();
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  it('clears all listeners when clear() is called', () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    dispatcher.subscribe(listenerA);
    dispatcher.subscribe(listenerB);

    dispatcher.clear();

    dispatcher.notify(mockEvent);

    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).not.toHaveBeenCalled();
  });

  it('exports a default singleton storageAlertDispatcher instance', () => {
    expect(storageAlertDispatcher).toBeInstanceOf(StorageAlertDispatcher);
  });
});
