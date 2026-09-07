import { describe, it, expect } from "vitest";
import {
  loadServerConfig,
  resolveAllowedOrigins,
  isOriginAllowed,
  ServerEnvSchema,
  type ServerEnv,
} from "../index.js";

describe("Server Config & Environment Validation (MAJ-015, MAJ-016)", () => {
  describe("loadServerConfig", () => {
    it("loads default configuration when raw environment is empty", () => {
      const config = loadServerConfig({});

      expect(config.NODE_ENV).toBe("development");
      expect(config.PORT).toBe(3000);
      expect(config.HOST).toBe("0.0.0.0");
      expect(config.LOG_LEVEL).toBe("info");
      expect(config.CORS_ORIGIN).toBeUndefined();
      expect(config.PUBLIC_URL).toBeUndefined();
      expect(config.TRUST_PROXY).toBe(false);
    });

    it("parses TRUST_PROXY truthy and falsy values", () => {
      expect(loadServerConfig({ TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
      expect(loadServerConfig({ TRUST_PROXY: "TRUE" }).TRUST_PROXY).toBe(true);
      expect(loadServerConfig({ TRUST_PROXY: "1" }).TRUST_PROXY).toBe(true);
      expect(loadServerConfig({ TRUST_PROXY: true }).TRUST_PROXY).toBe(true);

      expect(loadServerConfig({ TRUST_PROXY: "false" }).TRUST_PROXY).toBe(false);
      expect(loadServerConfig({ TRUST_PROXY: "0" }).TRUST_PROXY).toBe(false);
      expect(loadServerConfig({ TRUST_PROXY: false }).TRUST_PROXY).toBe(false);
      expect(loadServerConfig({ TRUST_PROXY: "random" }).TRUST_PROXY).toBe(false);
      expect(loadServerConfig({}).TRUST_PROXY).toBe(false);
    });

    it("parses valid custom PORT coerced to a number", () => {
      const config = loadServerConfig({
        PORT: "8080",
      });

      expect(config.PORT).toBe(8080);
      expect(typeof config.PORT).toBe("number");
    });

    it("parses valid custom LOG_LEVEL values", () => {
      const logLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

      for (const level of logLevels) {
        const config = loadServerConfig({ LOG_LEVEL: level });
        expect(config.LOG_LEVEL).toBe(level);
      }
    });

    it("parses custom HOST, LAN_IP, and HOST_IP", () => {
      const config = loadServerConfig({
        HOST: "127.0.0.1",
        LAN_IP: "192.168.1.50",
        HOST_IP: "10.0.0.5",
      });

      expect(config.HOST).toBe("127.0.0.1");
      expect(config.LAN_IP).toBe("192.168.1.50");
      expect(config.HOST_IP).toBe("10.0.0.5");
    });

    it("parses CLIENT_URL and RATE_LIMIT_* options", () => {
      const config = loadServerConfig({
        CLIENT_URL: "https://chess.fun.app",
        RATE_LIMIT_WINDOW_MS: "15000",
        RATE_LIMIT_MAX_REQUESTS: "10",
        RATE_LIMIT_MAX_KEYS: "25000",
      });

      expect(config.CLIENT_URL).toBe("https://chess.fun.app");
      expect(config.RATE_LIMIT_WINDOW_MS).toBe(15000);
      expect(config.RATE_LIMIT_MAX_REQUESTS).toBe(10);
      expect(config.RATE_LIMIT_MAX_KEYS).toBe(25000);
    });

    it("treats empty string environment variables as undefined", () => {
      const config = loadServerConfig({
        CORS_ORIGIN: "",
        PUBLIC_URL: "",
        CLIENT_URL: "",
        RATE_LIMIT_WINDOW_MS: "",
        RATE_LIMIT_MAX_REQUESTS: "",
        RATE_LIMIT_MAX_KEYS: "",
        LAN_IP: "",
        HOST_IP: "",
      });

      expect(config.CORS_ORIGIN).toBeUndefined();
      expect(config.PUBLIC_URL).toBeUndefined();
      expect(config.CLIENT_URL).toBeUndefined();
      expect(config.RATE_LIMIT_WINDOW_MS).toBeUndefined();
      expect(config.RATE_LIMIT_MAX_REQUESTS).toBeUndefined();
      expect(config.RATE_LIMIT_MAX_KEYS).toBeUndefined();
      expect(config.LAN_IP).toBeUndefined();
      expect(config.HOST_IP).toBeUndefined();
    });

    it("fails fast on invalid port range (< 0 or > 65535 or non-number)", () => {
      expect(() => loadServerConfig({ PORT: "-1" })).toThrow();
      expect(() => loadServerConfig({ PORT: "70000" })).toThrow();
      expect(() => loadServerConfig({ PORT: "not-a-number" })).toThrow();
    });

    it("fails fast on invalid LOG_LEVEL", () => {
      expect(() => loadServerConfig({ LOG_LEVEL: "verbose" })).toThrow();
      expect(() => loadServerConfig({ LOG_LEVEL: "silly" })).toThrow();
      expect(() => loadServerConfig({ LOG_LEVEL: "silent" })).toThrow();
    });

    it("fails fast on invalid NODE_ENV", () => {
      expect(() => loadServerConfig({ NODE_ENV: "staging" })).toThrow();
      expect(() => loadServerConfig({ NODE_ENV: "qa" })).toThrow();
    });
  });

  describe("resolveAllowedOrigins", () => {
    it("returns default localhost origins in development when no custom origins are set", () => {
      const env: ServerEnv = {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
      ]);
    });

    it("parses and trims comma-separated CORS_ORIGIN", () => {
      const env: ServerEnv = {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        CORS_ORIGIN: "https://chess.example.com, https://play.fun-chess.io , http://localhost:5173",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual([
        "https://chess.example.com",
        "https://play.fun-chess.io",
        "http://localhost:5173",
      ]);
    });

    it("derives origin from PUBLIC_URL when CORS_ORIGIN is not set", () => {
      const env: ServerEnv = {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        PUBLIC_URL: "https://fun-chess-app-prod.a.run.app/play?room=ABCD",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual(["https://fun-chess-app-prod.a.run.app"]);
    });

    it("derives origin from CLIENT_URL when CORS_ORIGIN is not set", () => {
      const env: ServerEnv = {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        CLIENT_URL: "https://fun-chess-client.example.com/play",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual(["https://fun-chess-client.example.com"]);
    });

    it("requires CORS_ORIGIN or PUBLIC_URL in production mode and throws if neither is set", () => {
      const env: ServerEnv = {
        NODE_ENV: "production",
        PORT: 8080,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
      };

      expect(() => resolveAllowedOrigins(env)).toThrowError(
        /FATAL: CORS_ORIGIN or PUBLIC_URL must be configured in production mode/,
      );
    });

    it("resolves CORS_ORIGIN in production mode without throwing", () => {
      const env: ServerEnv = {
        NODE_ENV: "production",
        PORT: 8080,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        CORS_ORIGIN: "https://fun-chess.com, https://www.fun-chess.com",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual([
        "https://fun-chess.com",
        "https://www.fun-chess.com",
      ]);
    });

    it("resolves PUBLIC_URL in production mode without throwing", () => {
      const env: ServerEnv = {
        NODE_ENV: "production",
        PORT: 8080,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        PUBLIC_URL: "https://fun-chess-prod.a.run.app",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual(["https://fun-chess-prod.a.run.app"]);
    });
  });

  describe("isOriginAllowed", () => {
    it("returns true when origin is undefined (same-origin or server-to-server)", () => {
      expect(isOriginAllowed(undefined, ["https://example.com"])).toBe(true);
      expect(isOriginAllowed("", ["https://example.com"])).toBe(true);
    });

    it("returns true for any origin when allowedOrigins contains wildcard '*'", () => {
      expect(isOriginAllowed("https://malicious-site.com", ["*"])).toBe(true);
      expect(isOriginAllowed("http://random.org", ["http://localhost:3000", "*"])).toBe(true);
    });

    it("returns true when origin matches an entry in allowedOrigins", () => {
      const allowed = ["https://fun-chess.com", "http://localhost:5173"];
      expect(isOriginAllowed("https://fun-chess.com", allowed)).toBe(true);
      expect(isOriginAllowed("http://localhost:5173", allowed)).toBe(true);
    });

    it("returns false when origin is not in allowedOrigins", () => {
      const allowed = ["https://fun-chess.com", "http://localhost:5173"];
      expect(isOriginAllowed("https://evil-attacker.com", allowed)).toBe(false);
      expect(isOriginAllowed("http://localhost:3000", allowed)).toBe(false);
    });
  });
});
