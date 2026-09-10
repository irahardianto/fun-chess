import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from 'vue';
import {
  BrowserLocationProvider,
  BrowserNetworkMonitor,
  LOCATION_PROVIDER_KEY,
  NETWORK_MONITOR_KEY,
} from '../index';
import {
  MockLocationProvider,
  MockNetworkMonitor,
} from '../testing';
import { useInjectLocationProvider, useInjectNetworkMonitor } from '../../di';

describe('Browser Capability Providers (MAJ-015)', () => {
  describe('BrowserLocationProvider', () => {
    it('reads properties from global window.location', () => {
      const provider = new BrowserLocationProvider();
      expect(provider.href).toBe(window.location.href);
      expect(provider.origin).toBe(window.location.origin);
      expect(provider.host).toBe(window.location.host);
      expect(provider.hostname).toBe(window.location.hostname);
      expect(provider.port).toBe(window.location.port);
      expect(provider.pathname).toBe(window.location.pathname);
      expect(provider.protocol).toBe(window.location.protocol);
    });

    it('delegates assign, replace, and reload to window.location', () => {
      const originalLocation = window.location;
      const assignMock = vi.fn();
      const replaceMock = vi.fn();
      const reloadMock = vi.fn();

      // @ts-expect-error test mock
      delete window.location;
      // @ts-expect-error test mock
      window.location = {
        href: originalLocation.href,
        origin: originalLocation.origin,
        host: originalLocation.host,
        hostname: originalLocation.hostname,
        port: originalLocation.port,
        pathname: originalLocation.pathname,
        protocol: originalLocation.protocol,
        assign: assignMock,
        replace: replaceMock,
        reload: reloadMock,
      };

      try {
        const provider = new BrowserLocationProvider();
        provider.assign('http://localhost:3000/room/ABCDEF');
        expect(assignMock).toHaveBeenCalledWith('http://localhost:3000/room/ABCDEF');

        provider.replace('http://localhost:3000/play');
        expect(replaceMock).toHaveBeenCalledWith('http://localhost:3000/play');

        provider.reload();
        expect(reloadMock).toHaveBeenCalled();
      } finally {
        window.location = originalLocation as any;
      }
    });

    it('handles headless / non-window environment safely', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error test environment manipulation
      delete globalThis.window;
      try {
        const provider = new BrowserLocationProvider();
        expect(provider.href).toBe('');
        expect(provider.origin).toBe('');
        expect(provider.host).toBe('');
        expect(provider.hostname).toBe('');
        expect(provider.port).toBe('');
        expect(provider.pathname).toBe('');
        expect(provider.protocol).toBe('');
        expect(() => provider.assign('/test')).not.toThrow();
        expect(() => provider.replace('/test')).not.toThrow();
        expect(() => provider.reload()).not.toThrow();
      } finally {
        globalThis.window = originalWindow;
      }
    });
  });

  describe('MockLocationProvider', () => {
    it('initializes with default URL and parses URL parts', () => {
      const mock = new MockLocationProvider('https://fun-chess.app:8080/join/XYZ?theme=wood');
      expect(mock.href).toBe('https://fun-chess.app:8080/join/XYZ?theme=wood');
      expect(mock.origin).toBe('https://fun-chess.app:8080');
      expect(mock.host).toBe('fun-chess.app:8080');
      expect(mock.hostname).toBe('fun-chess.app');
      expect(mock.port).toBe('8080');
      expect(mock.pathname).toBe('/join/XYZ');
      expect(mock.protocol).toBe('https:');
    });

    it('defaults to http://localhost:3000/ when omitted', () => {
      const mock = new MockLocationProvider();
      expect(mock.href).toBe('http://localhost:3000/');
      expect(mock.origin).toBe('http://localhost:3000');
      expect(mock.hostname).toBe('localhost');
      expect(mock.port).toBe('3000');
    });

    it('updates URL on assign, replace, and setUrl', () => {
      const mock = new MockLocationProvider('http://localhost:3000/lobby');
      mock.assign('/room/TEST12');
      expect(mock.pathname).toBe('/room/TEST12');
      expect(mock.href).toBe('http://localhost:3000/room/TEST12');

      mock.replace('https://chess.example.com/play');
      expect(mock.origin).toBe('https://chess.example.com');
      expect(mock.pathname).toBe('/play');

      mock.setUrl('http://192.168.1.50:4000/hud');
      expect(mock.host).toBe('192.168.1.50:4000');
      expect(mock.hostname).toBe('192.168.1.50');
      expect(mock.port).toBe('4000');
    });

    it('reload performs no-op without error', () => {
      const mock = new MockLocationProvider();
      expect(() => mock.reload()).not.toThrow();
    });
  });

  describe('BrowserNetworkMonitor', () => {
    let monitor: BrowserNetworkMonitor;

    beforeEach(() => {
      monitor = new BrowserNetworkMonitor();
    });

    afterEach(() => {
      monitor.reset();
    });

    it('queries navigator.onLine status', () => {
      expect(typeof monitor.isOnline()).toBe('boolean');
    });

    it('registers and triggers listeners on window online/offline events', () => {
      const listener = vi.fn();
      const unsubscribe = monitor.addListener(listener);

      window.dispatchEvent(new Event('offline'));
      expect(listener).toHaveBeenCalledWith(false);

      window.dispatchEvent(new Event('online'));
      expect(listener).toHaveBeenCalledWith(true);

      unsubscribe();
      window.dispatchEvent(new Event('offline'));
      expect(listener).toHaveBeenCalledTimes(2); // No additional calls after unsubscribe
    });

    it('cleans up window event listeners on reset', () => {
      const listener = vi.fn();
      monitor.addListener(listener);
      monitor.reset();

      window.dispatchEvent(new Event('offline'));
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('MockNetworkMonitor', () => {
    it('manages online status and triggers listeners deterministically', () => {
      const mock = new MockNetworkMonitor(true);
      expect(mock.isOnline()).toBe(true);

      const listener = vi.fn();
      const unsubscribe = mock.addListener(listener);

      mock.setOnlineStatus(false);
      expect(mock.isOnline()).toBe(false);
      expect(listener).toHaveBeenCalledWith(false);

      mock.setOnlineStatus(true);
      expect(mock.isOnline()).toBe(true);
      expect(listener).toHaveBeenCalledWith(true);

      unsubscribe();
      mock.setOnlineStatus(false);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('clears listeners on reset', () => {
      const mock = new MockNetworkMonitor(true);
      const listener = vi.fn();
      mock.addListener(listener);
      mock.reset();

      mock.setOnlineStatus(false);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Vue DI Tokens & Resolvers', () => {
    it('exports defined Symbol injection keys', () => {
      expect(typeof LOCATION_PROVIDER_KEY).toBe('symbol');
      expect(typeof NETWORK_MONITOR_KEY).toBe('symbol');
    });

    it('resolves default capability providers or custom fallbacks', () => {
      const defaultLoc = useInjectLocationProvider();
      expect(defaultLoc).toBeInstanceOf(BrowserLocationProvider);

      const customMockLoc = new MockLocationProvider('http://custom.test:5000/');
      const resolvedCustomLoc = useInjectLocationProvider(customMockLoc);
      expect(resolvedCustomLoc).toBe(customMockLoc);

      const defaultNet = useInjectNetworkMonitor();
      expect(defaultNet).toBeInstanceOf(BrowserNetworkMonitor);

      const customMockNet = new MockNetworkMonitor(false);
      const resolvedCustomNet = useInjectNetworkMonitor(customMockNet);
      expect(resolvedCustomNet).toBe(customMockNet);
    });

    it('resolves provided capability providers in Vue injection context (WRN-03)', () => {
      const customLoc = new MockLocationProvider('http://provided.test/');
      const customNet = new MockNetworkMonitor(false);

      const app = createApp({});
      app.provide(LOCATION_PROVIDER_KEY, customLoc);
      app.provide(NETWORK_MONITOR_KEY, customNet);

      app.runWithContext(() => {
        expect(useInjectLocationProvider()).toBe(customLoc);
        expect(useInjectNetworkMonitor()).toBe(customNet);
      });
    });
  });
});
