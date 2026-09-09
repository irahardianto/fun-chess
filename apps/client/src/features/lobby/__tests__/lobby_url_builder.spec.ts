import { describe, it, expect } from 'vitest';
import {
  isCloudRelayMode,
  isLocalhostAddress,
  resolveEffectiveHost,
  resolveEffectivePort,
  buildLobbyBaseUrl,
  buildLobbyJoinUrl,
} from '../lobby_url_builder';

describe('lobby_url_builder', () => {
  describe('isCloudRelayMode', () => {
    it('returns true when isCloudRelay is true', () => {
      expect(isCloudRelayMode({ lanInfo: { isCloudRelay: true } })).toBe(true);
    });

    it('returns true when relayMode is cloud', () => {
      expect(isCloudRelayMode({ lanInfo: { relayMode: 'cloud' } })).toBe(true);
    });

    it('returns true when publicUrl is present', () => {
      expect(isCloudRelayMode({ lanInfo: { publicUrl: 'https://chess.fun' } })).toBe(true);
    });

    it('returns true when windowLocation protocol is https:', () => {
      expect(isCloudRelayMode({ windowLocation: { protocol: 'https:' } })).toBe(true);
    });

    it('returns false for pure LAN mode over http:', () => {
      expect(
        isCloudRelayMode({
          lanInfo: { lanIp: '192.168.1.5', port: 3000 },
          windowLocation: { protocol: 'http:' },
        })
      ).toBe(false);
    });
  });

  describe('isLocalhostAddress', () => {
    it('identifies localhost and loopback IPv4/IPv6', () => {
      expect(isLocalhostAddress('localhost')).toBe(true);
      expect(isLocalhostAddress('127.0.0.1')).toBe(true);
      expect(isLocalhostAddress('::1')).toBe(true);
    });

    it('returns false for non-loopback addresses', () => {
      expect(isLocalhostAddress('192.168.1.50')).toBe(false);
      expect(isLocalhostAddress('chess.example.com')).toBe(false);
    });
  });

  describe('resolveEffectiveHost', () => {
    it('prioritizes activeLanIp in LAN mode', () => {
      const host = resolveEffectiveHost({
        activeLanIp: '192.168.1.100',
        lanInfo: { lanIp: '192.168.1.5' },
        windowLocation: { hostname: '192.168.1.200' },
      });
      expect(host).toBe('192.168.1.100');
    });

    it('extracts hostname from publicUrl in cloud mode', () => {
      const host = resolveEffectiveHost({
        lanInfo: { publicUrl: 'https://chess-relay.run.app:8080/path' },
      });
      expect(host).toBe('chess-relay.run.app');
    });

    it('uses windowLocation hostname when non-localhost', () => {
      const host = resolveEffectiveHost({
        windowLocation: { hostname: 'fun-chess.local' },
        lanInfo: { lanIp: '192.168.1.5' },
      });
      expect(host).toBe('fun-chess.local');
    });

    it('falls back to server lanIp when windowLocation is localhost', () => {
      const host = resolveEffectiveHost({
        windowLocation: { hostname: 'localhost' },
        lanInfo: { lanIp: '192.168.1.75' },
      });
      expect(host).toBe('192.168.1.75');
    });

    it('falls back to localhost when no options are provided', () => {
      const host = resolveEffectiveHost({
        windowLocation: null,
      });
      expect(host).toBe('localhost');
    });
  });

  describe('resolveEffectivePort', () => {
    it('returns empty string in cloud mode', () => {
      const port = resolveEffectivePort({
        lanInfo: { isCloudRelay: true, port: 3000 },
      });
      expect(port).toBe('');
    });

    it('returns empty string for https protocol', () => {
      const port = resolveEffectivePort({
        windowLocation: { protocol: 'https:', port: '3000' },
      });
      expect(port).toBe('');
    });

    it('returns empty string for standard ports 80 and 443', () => {
      expect(resolveEffectivePort({ windowLocation: { protocol: 'http:', port: '80' } })).toBe('');
      expect(resolveEffectivePort({ windowLocation: { protocol: 'http:', port: '443' } })).toBe('');
      expect(resolveEffectivePort({ lanInfo: { port: 80 }, windowLocation: { protocol: 'http:', port: '' } })).toBe('');
    });

    it('returns window port if available and non-standard', () => {
      const port = resolveEffectivePort({
        windowLocation: { protocol: 'http:', port: '8080' },
      });
      expect(port).toBe('8080');
    });

    it('returns lanInfo port when window port is omitted', () => {
      const port = resolveEffectivePort({
        lanInfo: { port: 5000 },
        windowLocation: { protocol: 'http:', port: '' },
      });
      expect(port).toBe('5000');
    });

    it('defaults to 3000 when no port is specified', () => {
      const port = resolveEffectivePort({
        windowLocation: { protocol: 'http:', port: '' },
      });
      expect(port).toBe('3000');
    });
  });

  describe('buildLobbyBaseUrl', () => {
    it('formats LAN URL with host and port', () => {
      const url = buildLobbyBaseUrl({
        lanInfo: { lanIp: '192.168.1.50', port: 3000 },
        windowLocation: { protocol: 'http:', hostname: 'localhost', port: '3000', origin: 'http://localhost:3000' },
      });
      expect(url).toBe('http://192.168.1.50:3000');
    });

    it('omits port when port is 80', () => {
      const url = buildLobbyBaseUrl({
        lanInfo: { lanIp: '192.168.1.50', port: 80 },
        windowLocation: { protocol: 'http:', hostname: 'localhost', port: '80', origin: 'http://localhost:80' },
      });
      expect(url).toBe('http://192.168.1.50');
    });

    it('uses publicUrl in cloud mode and strips trailing slashes', () => {
      const url = buildLobbyBaseUrl({
        lanInfo: { publicUrl: 'https://chess.cloud.run///' },
      });
      expect(url).toBe('https://chess.cloud.run');
    });

    it('uses window origin in cloud mode when publicUrl is absent', () => {
      const url = buildLobbyBaseUrl({
        lanInfo: { isCloudRelay: true },
        windowLocation: { protocol: 'https:', hostname: 'chess.org', port: '', origin: 'https://chess.org/' },
      });
      expect(url).toBe('https://chess.org');
    });
  });

  describe('buildLobbyJoinUrl', () => {
    it('returns override joinUrl if provided', () => {
      const url = buildLobbyJoinUrl({
        joinUrl: 'https://custom-join.com/?join=XYZ',
        roomCode: 'IGNORED',
      });
      expect(url).toBe('https://custom-join.com/?join=XYZ');
    });

    it('appends roomCode query param when provided', () => {
      const url = buildLobbyJoinUrl({
        lanInfo: { lanIp: '192.168.1.20', port: 3000 },
        windowLocation: { protocol: 'http:', hostname: 'localhost', port: '3000', origin: 'http://localhost:3000' },
        roomCode: 'STAR',
      });
      expect(url).toBe('http://192.168.1.20:3000/?join=STAR');
    });

    it('returns baseUrl when roomCode is empty or omitted', () => {
      const url = buildLobbyJoinUrl({
        lanInfo: { lanIp: '192.168.1.20', port: 3000 },
        windowLocation: { protocol: 'http:', hostname: 'localhost', port: '3000', origin: 'http://localhost:3000' },
      });
      expect(url).toBe('http://192.168.1.20:3000');
    });
  });
});
