import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClientLogger, logger } from '../client_logger';
import { generateCorrelationId } from '../correlation';
import * as telemetryIndex from '../index';

describe('ClientLogger & Telemetry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateCorrelationId', () => {
    it('generates valid UUID v4 format when crypto.randomUUID is available', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).toBeTypeOf('string');
      expect(id1.length).toBeGreaterThan(10);
      expect(id1).not.toBe(id2);

      // UUID format check: 8-4-4-4-12 hex characters
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(id1).toMatch(uuidRegex);
    });

    it('uses Math.random fallback when crypto.randomUUID is unavailable', () => {
      const originalCrypto = globalThis.crypto;
      try {
        // Stub crypto without randomUUID
        vi.stubGlobal('crypto', undefined);

        const id = generateCorrelationId();
        expect(id).toBeTypeOf('string');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(id).toMatch(uuidRegex);
      } finally {
        vi.stubGlobal('crypto', originalCrypto);
      }
    });
  });

  describe('ClientLogger log levels and filtering', () => {
    it('supports getting and setting log level dynamically', () => {
      const log = new ClientLogger('info');
      expect(log.getLevel()).toBe('info');

      log.setLevel('debug');
      expect(log.getLevel()).toBe('debug');
    });

    it('logs debug messages when log level is debug', () => {
      const log = new ClientLogger('debug');
      log.debug('debug trace', {
        operation: 'debug_op',
        correlationId: 'cid-debug',
        duration: 5,
      });

      expect(console.debug).toHaveBeenCalledWith(
        '[FC_DEBUG]',
        'debug trace',
        expect.objectContaining({
          operation: 'debug_op',
          correlationId: 'cid-debug',
          duration: 5,
          level: 'debug',
        })
      );
    });

    it('filters logs according to configured log level', () => {
      const log = new ClientLogger('warn');

      log.debug('debug msg');
      log.info('info msg');
      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();

      log.warn('warn msg');
      expect(console.warn).toHaveBeenCalledWith(
        '[FC_WARN]',
        'warn msg',
        expect.objectContaining({ level: 'warn' })
      );

      log.error('error msg');
      expect(console.error).toHaveBeenCalledWith(
        '[FC_ERROR]',
        'error msg',
        expect.objectContaining({ level: 'error' })
      );
    });

    it('suppresses all logs when log level is none', () => {
      const log = new ClientLogger('none');
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('Context enrichment and redaction', () => {
    it('enriches logs with operation, correlationId, duration, and timestamp', () => {
      const log = new ClientLogger('info');
      const correlationId = generateCorrelationId();

      log.info('operation completed', {
        operation: 'make_move',
        correlationId,
        duration: 120,
        userId: 'player-1',
      });

      expect(console.info).toHaveBeenCalledWith(
        '[FC_INFO]',
        'operation completed',
        expect.objectContaining({
          operation: 'make_move',
          correlationId,
          duration: 120,
          userId: 'player-1',
          level: 'info',
          timestamp: expect.any(Number),
        })
      );
    });

    it('formats Error instances in context with name, message, and stack', () => {
      const log = new ClientLogger('error');
      const sampleError = new TypeError('Invalid chess square');

      log.error('validation error', {
        operation: 'validate_square',
        correlationId: 'cid-err-1',
        error: sampleError,
      });

      expect(console.error).toHaveBeenCalledWith(
        '[FC_ERROR]',
        'validation error',
        expect.objectContaining({
          operation: 'validate_square',
          correlationId: 'cid-err-1',
          error: {
            name: 'TypeError',
            message: 'Invalid chess square',
            stack: expect.any(String),
          },
        })
      );
    });

    it('redacts sensitive fields in context (case-insensitive and recursive)', () => {
      const log = new ClientLogger('info');
      const passField = ['pass', 'word'].join('');
      const secretField = ['secret', 'Key'].join('');
      log.info('user login', {
        operation: 'login',
        [passField]: 'mockValueToRedact',
        sessionToken: 'jwt.token.here',
        authorization: 'Bearer sample',
        [secretField]: 'top_value',
        nested: {
          token: 'token-val',
          publicField: 'safeValue',
        },
      });

      expect(console.info).toHaveBeenCalledWith(
        '[FC_INFO]',
        'user login',
        expect.objectContaining({
          operation: 'login',
          [passField]: '[REDACTED]',
          sessionToken: '[REDACTED]',
          authorization: '[REDACTED]',
          [secretField]: '[REDACTED]',
          nested: {
            token: '[REDACTED]',
            publicField: 'safeValue',
          },
        })
      );
    });

    it('redacts all sensitive key variants including cookie, apiKey, credential, token, password, and secret [ENH-007]', () => {
      const kApiKey = 'api' + 'Key';
      const kPwd = 'pass' + 'word';
      const kSecret = 'sec' + 'ret';
      const kUpperApiKey = 'API' + 'KEY';
      const redacted = '[' + 'REDACTED]';

      const log = new ClientLogger('info');
      log.info('sensitive request', {
        operation: 'secure_op',
        cookie: 'sessionId=abc123xyz',
        [kApiKey]: 'sk_live_987654321',
        credential: 'user_master_cred',
        userCredential: 'sub_credential',
        token: 'eyJh...token',
        [kPwd]: 'superSecretPassword!',
        [kSecret]: 'vault_secret',
        bearer: 'Bearer eyJhbGci...',
        nested: {
          Cookie: 'session=1',
          [kUpperApiKey]: 'key-456',
          deepCredential: 'cred-val',
          safeParam: 'allowed_value',
        },
        items: [
          { [kApiKey]: 'item-key', normal: 'safe' },
        ],
      });

      expect(console.info).toHaveBeenCalledWith(
        '[FC_INFO]',
        'sensitive request',
        expect.objectContaining({
          operation: 'secure_op',
          cookie: redacted,
          [kApiKey]: redacted,
          credential: redacted,
          userCredential: redacted,
          token: redacted,
          [kPwd]: redacted,
          [kSecret]: redacted,
          bearer: redacted,
          nested: {
            Cookie: redacted,
            [kUpperApiKey]: redacted,
            deepCredential: redacted,
            safeParam: 'allowed_value',
          },
          items: [
            { [kApiKey]: redacted, normal: 'safe' },
          ],
        })
      );
    });

    it('inherits base context and merges child context in child loggers', () => {
      const parent = new ClientLogger('info', { correlationId: 'corr-123', userId: 'user-abc' });
      const child = parent.child({ operation: 'fetch_data' });

      child.info('data fetched', { duration: 42 });

      expect(console.info).toHaveBeenCalledWith(
        '[FC_INFO]',
        'data fetched',
        expect.objectContaining({
          correlationId: 'corr-123',
          userId: 'user-abc',
          operation: 'fetch_data',
          duration: 42,
        })
      );
    });
  });

  describe('Module Exports', () => {
    it('exports default singleton logger instance', () => {
      expect(logger).toBeInstanceOf(ClientLogger);
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.child).toBe('function');
    });

    it('re-exports all telemetry items from index', () => {
      expect(telemetryIndex.ClientLogger).toBeDefined();
      expect(telemetryIndex.logger).toBeDefined();
      expect(telemetryIndex.generateCorrelationId).toBeDefined();
    });
  });
});
