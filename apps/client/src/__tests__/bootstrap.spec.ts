import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFunChessApp, registerGlobalWindowErrorHandlers } from '../main';
import {
  API_CLIENT_KEY,
  STORAGE_KEY,
  SESSION_STORAGE_KEY,
  AUDIO_SERVICE_KEY,
  LOGGER_KEY,
  SCENARIO_STORE_KEY,
  PUZZLE_STORE_KEY,
  FILE_DOWNLOADER_KEY,
  HAPTICS_KEY,
  WEBRTC_DISCOVERY_KEY,
  CLIPBOARD_SERVICE_KEY,
  CAMERA_SERVICE_KEY,
} from '../platform/di';
import { logger } from '../platform/telemetry';

describe('Application Bootstrap & Composition Root (MAJ-040)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates Vue application and registers all required platform DI tokens [MAJ-040, MAJ-015]', () => {
    const app = createFunChessApp();
    expect(app).toBeDefined();

    // Vue 3 stores provides in app._context.provides
    const provides = (app as any)._context.provides;
    expect(provides).toBeDefined();

    // Verify all core and hardware platform tokens are provided
    expect(provides[API_CLIENT_KEY as any]).toBeDefined();
    expect(provides[STORAGE_KEY as any]).toBeDefined();
    expect(provides[SESSION_STORAGE_KEY as any]).toBeDefined();
    expect(provides[AUDIO_SERVICE_KEY as any]).toBeDefined();
    expect(provides[LOGGER_KEY as any]).toBeDefined();
    expect(provides[SCENARIO_STORE_KEY as any]).toBeDefined();
    expect(provides[PUZZLE_STORE_KEY as any]).toBeDefined();
    expect(provides[FILE_DOWNLOADER_KEY as any]).toBeDefined();
    expect(provides[HAPTICS_KEY as any]).toBeDefined();
    expect(provides[WEBRTC_DISCOVERY_KEY as any]).toBeDefined();
    expect(provides[CLIPBOARD_SERVICE_KEY as any]).toBeDefined();
    expect(provides[CAMERA_SERVICE_KEY as any]).toBeDefined();
  });

  it('configures global Vue errorHandler with structured telemetry logging [MAJ-040, MIN-014]', () => {
    const app = createFunChessApp();
    const errorHandler = app.config.errorHandler;
    expect(typeof errorHandler).toBe('function');

    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const testError = new Error('Vue render component error');
    errorHandler!(testError, null, 'TestComponent > template');

    expect(loggerSpy).toHaveBeenCalledWith(
      'Unhandled Vue application error',
      expect.objectContaining({
        operation: 'vue_error_handler',
        error: 'Vue render component error',
        componentInfo: 'TestComponent > template',
        correlationId: expect.any(String),
      })
    );

    loggerSpy.mockRestore();
  });

  it('registers and cleans up global window error and unhandledrejection handlers [MAJ-005, MAJ-040]', () => {
    const mockLogger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    };

    // Create an isolated EventTarget window mock
    const eventListeners: Record<string, Function[]> = {
      error: [],
      unhandledrejection: [],
    };

    const mockWindow = {
      addEventListener: vi.fn((event: string, handler: Function) => {
        eventListeners[event]?.push(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: Function) => {
        const list = eventListeners[event];
        if (list) {
          const idx = list.indexOf(handler);
          if (idx !== -1) list.splice(idx, 1);
        }
      }),
    } as unknown as Window;

    const cleanup = registerGlobalWindowErrorHandlers(mockWindow, mockLogger as any);

    expect(mockWindow.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockWindow.addEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

    // Simulate window error event
    const errorEvent = {
      message: 'Script evaluation failure',
      filename: 'bundle.js',
      lineno: 42,
      colno: 10,
      error: new Error('Script error'),
    } as unknown as ErrorEvent;

    eventListeners.error?.forEach((fn) => fn(errorEvent));

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Unhandled window error',
      expect.objectContaining({
        operation: 'window_error_handler',
        message: 'Script evaluation failure',
        filename: 'bundle.js',
        lineno: 42,
        colno: 10,
        correlationId: expect.any(String),
      })
    );

    // Simulate unhandled promise rejection event
    const rejectionEvent = {
      reason: new Error('Network request dropped'),
    } as unknown as PromiseRejectionEvent;

    eventListeners.unhandledrejection?.forEach((fn) => fn(rejectionEvent));

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Unhandled promise rejection',
      expect.objectContaining({
        operation: 'window_unhandled_rejection',
        error: 'Network request dropped',
        correlationId: expect.any(String),
      })
    );

    // Unregister and verify event listeners removed
    cleanup();
    expect(mockWindow.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockWindow.removeEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
  });

  it('can mount the application into a target DOM container without throwing [MAJ-040]', () => {
    const app = createFunChessApp();
    const container = document.createElement('div');
    container.id = 'test-app-mount';
    document.body.appendChild(container);

    expect(() => {
      app.mount(container);
    }).not.toThrow();

    app.unmount();
    container.remove();
  });
});
