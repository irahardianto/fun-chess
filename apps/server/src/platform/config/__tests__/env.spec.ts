import { describe, it, expect } from "vitest";
import {
  loadServerConfig,
  validateServerConfig,
  resolveAllowedOrigins,
  isOriginAllowed,
  safeParseUrl,
  type ServerEnv,
} from "../index.js";

describe("Server Config & Environment Validation (CRIT-003, CRIT-007, MIN-003, ENH-003)", () => {
  describe("safeParseUrl (CRIT-003)", () => {
    it("parses valid URLs with http and https protocols", () => {
      const u1 = safeParseUrl("https://fun-chess.com/play");
      expect(u1).toBeDefined();
      expect(u1?.origin).toBe("https://fun-chess.com");

      const u2 = safeParseUrl("http://localhost:3000");
      expect(u2).toBeDefined();
      expect(u2?.origin).toBe("http://localhost:3000");
    });

    it("normalizes protocol-less URLs by prefixing with protocol", () => {
      const u1 = safeParseUrl("chess.example.com");
      expect(u1).toBeDefined();
      expect(u1?.origin).toBe("https://chess.example.com");

      const u2 = safeParseUrl("localhost:5173");
      expect(u2).toBeDefined();
      expect(u2?.origin).toBe("http://localhost:5173");

      const u3 = safeParseUrl("127.0.0.1:8080/room/1234");
      expect(u3).toBeDefined();
      expect(u3?.origin).toBe("http://127.0.0.1:8080");
    });

    it("normalizes protocol-relative URLs", () => {
      const u = safeParseUrl("//fun-chess-prod.a.run.app");
      expect(u).toBeDefined();
      expect(u?.origin).toBe("https://fun-chess-prod.a.run.app");
    });

    it("returns undefined for invalid or empty inputs without throwing", () => {
      expect(safeParseUrl("")).toBeUndefined();
      expect(safeParseUrl("   ")).toBeUndefined();
      expect(safeParseUrl(undefined as unknown as string)).toBeUndefined();
      expect(safeParseUrl("http://:invalid")).toBeUndefined();
    });
  });

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
      expect(config.RATE_LIMIT_ROOM_CREATE_MAX).toBe(3);
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

    it("parses CLIENT_URL, CLIENT_DIST_PATH, and RATE_LIMIT_* options", () => {
      const config = loadServerConfig({
        CLIENT_URL: "https://chess.fun.app",
        CLIENT_DIST_PATH: "/var/www/dist",
        RATE_LIMIT_WINDOW_MS: "15000",
        RATE_LIMIT_MAX_REQUESTS: "10",
        RATE_LIMIT_MAX_KEYS: "25000",
        RATE_LIMIT_ROOM_CREATE_MAX: "5",
      });

      expect(config.CLIENT_URL).toBe("https://chess.fun.app");
      expect(config.CLIENT_DIST_PATH).toBe("/var/www/dist");
      expect(config.RATE_LIMIT_WINDOW_MS).toBe(15000);
      expect(config.RATE_LIMIT_MAX_REQUESTS).toBe(10);
      expect(config.RATE_LIMIT_MAX_KEYS).toBe(25000);
      expect(config.RATE_LIMIT_ROOM_CREATE_MAX).toBe(5);
    });

    it("parses and validates RATE_LIMIT_ROOM_CREATE_MAX", () => {
      expect(loadServerConfig({}).RATE_LIMIT_ROOM_CREATE_MAX).toBe(3);
      expect(loadServerConfig({ RATE_LIMIT_ROOM_CREATE_MAX: "" }).RATE_LIMIT_ROOM_CREATE_MAX).toBe(3);
      expect(loadServerConfig({ RATE_LIMIT_ROOM_CREATE_MAX: "7" }).RATE_LIMIT_ROOM_CREATE_MAX).toBe(7);
      expect(loadServerConfig({ RATE_LIMIT_ROOM_CREATE_MAX: 12 }).RATE_LIMIT_ROOM_CREATE_MAX).toBe(12);

      expect(() => loadServerConfig({ RATE_LIMIT_ROOM_CREATE_MAX: "0" })).toThrow();
      expect(() => loadServerConfig({ RATE_LIMIT_ROOM_CREATE_MAX: "-1" })).toThrow();
      expect(() => loadServerConfig({ RATE_LIMIT_ROOM_CREATE_MAX: "3.14" })).toThrow();
      expect(() => loadServerConfig({ RATE_LIMIT_ROOM_CREATE_MAX: "invalid" })).toThrow();
    });

    it("validateServerConfig validates and returns configuration identically to loadServerConfig", () => {
      const config = validateServerConfig({
        PORT: "4000",
        CLIENT_DIST_PATH: "/custom/dist",
      });

      expect(config.PORT).toBe(4000);
      expect(config.CLIENT_DIST_PATH).toBe("/custom/dist");
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

    describe("Production Cloud Run Validation (CRIT-007)", () => {
      it("fails fast in production mode when neither CORS_ORIGIN, PUBLIC_URL, nor CLIENT_URL is provided", () => {
        expect(() =>
          loadServerConfig({
            NODE_ENV: "production",
          }),
        ).toThrowError(/Either CORS_ORIGIN, PUBLIC_URL, or CLIENT_URL must be configured in production mode/);
      });

      it("fails fast in production mode when CORS_ORIGIN contains wildcard '*'", () => {
        expect(() =>
          loadServerConfig({
            NODE_ENV: "production",
            CORS_ORIGIN: "*",
          }),
        ).toThrowError(/Wildcard CORS_ORIGIN '\*' is forbidden in production mode/);

        expect(() =>
          loadServerConfig({
            NODE_ENV: "production",
            CORS_ORIGIN: "https://fun-chess.com, *",
          }),
        ).toThrowError(/Wildcard CORS_ORIGIN '\*' is forbidden in production mode/);
      });

      it("fails fast in production mode when PUBLIC_URL is invalid", () => {
        expect(() =>
          loadServerConfig({
            NODE_ENV: "production",
            PUBLIC_URL: "http://:invalid",
          }),
        ).toThrowError(/PUBLIC_URL must be a valid URL/);
      });

      it("succeeds in production mode with valid CORS_ORIGIN", () => {
        const config = loadServerConfig({
          NODE_ENV: "production",
          CORS_ORIGIN: "https://fun-chess.com, https://play.fun-chess.com",
        });
        expect(config.NODE_ENV).toBe("production");
        expect(config.CORS_ORIGIN).toBe("https://fun-chess.com, https://play.fun-chess.com");
      });

      it("succeeds in production mode with valid PUBLIC_URL", () => {
        const config = loadServerConfig({
          NODE_ENV: "production",
          PUBLIC_URL: "https://fun-chess-app-prod.a.run.app",
        });
        expect(config.NODE_ENV).toBe("production");
        expect(config.PUBLIC_URL).toBe("https://fun-chess-app-prod.a.run.app");
      });
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

    it("parses and trims comma-separated CORS_ORIGIN, stripping trailing slashes (MIN-003)", () => {
      const env: ServerEnv = {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        CORS_ORIGIN: "https://chess.example.com/, https://play.fun-chess.io/// , http://localhost:5173",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual([
        "https://chess.example.com",
        "https://play.fun-chess.io",
        "http://localhost:5173",
      ]);
    });

    it("derives origin from PUBLIC_URL when CORS_ORIGIN is not set, stripping trailing slashes", () => {
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

    it("derives origin from protocol-less PUBLIC_URL without crashing (CRIT-003)", () => {
      const env: ServerEnv = {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        PUBLIC_URL: "fun-chess-prod.a.run.app/play",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual(["https://fun-chess-prod.a.run.app"]);
    });

    it("derives origin from CLIENT_URL when CORS_ORIGIN is not set, stripping trailing slashes", () => {
      const env: ServerEnv = {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        CLIENT_URL: "https://fun-chess-client.example.com/play/",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual(["https://fun-chess-client.example.com"]);
    });

    it("derives origin from protocol-less CLIENT_URL without crashing (CRIT-003)", () => {
      const env: ServerEnv = {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        CLIENT_URL: "localhost:5173/play",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual(["http://localhost:5173"]);
    });

    it("merges origins from both CLIENT_URL and PUBLIC_URL without duplicates (MIN-001)", () => {
      const env: ServerEnv = {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        CLIENT_URL: "https://app.fun-chess.io",
        PUBLIC_URL: "https://api.fun-chess.io",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual([
        "https://app.fun-chess.io",
        "https://api.fun-chess.io",
      ]);
    });

    it("strictly relies on passed env and does not fallback to process.env (ENH-003)", () => {
      const originalEnv = process.env.CORS_ORIGIN;
      try {
        process.env.CORS_ORIGIN = "https://leaked-from-process-env.com";
        const env: ServerEnv = {
          NODE_ENV: "development",
          PORT: 3000,
          HOST: "0.0.0.0",
          LOG_LEVEL: "info",
        };

        const origins = resolveAllowedOrigins(env);
        // Should NOT contain the leaked process.env value!
        expect(origins).toEqual([
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:3000",
        ]);
      } finally {
        if (originalEnv !== undefined) {
          process.env.CORS_ORIGIN = originalEnv;
        } else {
          delete process.env.CORS_ORIGIN;
        }
      }
    });

    it("requires CORS_ORIGIN or PUBLIC_URL in production mode and throws if neither is set", () => {
      const env: ServerEnv = {
        NODE_ENV: "production",
        PORT: 8080,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
      };

      expect(() => resolveAllowedOrigins(env)).toThrowError(
        /FATAL: CORS_ORIGIN, PUBLIC_URL, or CLIENT_URL must be configured in production mode/,
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

    it("resolves CLIENT_URL in production mode without throwing (MAJ-002)", () => {
      const env: ServerEnv = {
        NODE_ENV: "production",
        PORT: 8080,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        CLIENT_URL: "https://chess.fun.app",
      };

      const origins = resolveAllowedOrigins(env);
      expect(origins).toEqual(["https://chess.fun.app"]);
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
      // Trailing slash tolerance
      expect(isOriginAllowed("https://fun-chess.com/", allowed)).toBe(true);
      // Case-insensitive tolerance
      expect(isOriginAllowed("HTTPS://FUN-CHESS.COM", allowed)).toBe(true);
    });

    it("returns false when origin is not in allowedOrigins", () => {
      const allowed = ["https://fun-chess.com", "http://localhost:5173"];
      expect(isOriginAllowed("https://evil-attacker.com", allowed)).toBe(false);
      expect(isOriginAllowed("http://localhost:3000", allowed)).toBe(false);
    });
  });
});
