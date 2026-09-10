import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deflate } from "pako";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  ErrorCode,
  TimerHandle,
  ITimerService,
  Square,
  IClock,
  BaseServerEnv,
} from "../index.js";
import {
  // CRIT-002: Error Code & Error Class
  AppError,
  RoomCapacityExceededError,
  // MIN-017: Square & Type Guard
  SQUARES,
  isSquare,
  // MIN-001: Env Schemas
  BaseServerEnvSchema,
  ServerEnvSchema,
  // MAJ-006: Diagnostic Logging
  safeNormalizeUrl,
  safeParseUrl,
  isValidFen,
  isPawnPromotion,
  // MIN-006: Error Cause
  decodeProgressFromEnvelope,
  decodeProgressFromQr,
  bytesToBase64Url,
  crc32Checksum,
  // MIN-011: Canonical SystemClock
  SystemClock,
  systemClock,
  MockClock,
} from "../index.js";

// Also test direct imports from clock.js and chess.js contracts
import { SystemClock as DirectClock, MockClock as DirectMockClock } from "../utils/clock.js";
import { isSquare as directIsSquare, SQUARES as DIRECT_SQUARES } from "../contracts/chess.js";
import { FUN_CHESS_PAYLOAD_MAGIC_PREFIX } from "../types/progress_sync.js";

describe("Scope Card SC-1 Remediation Verification Suite", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    debugSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe("1. [CRIT-002] ErrorCode expansion and RoomCapacityExceededError", () => {
    it("allows 'ERR_ROOM_CAPACITY_EXCEEDED' as a valid ErrorCode type", () => {
      const code: ErrorCode = "ERR_ROOM_CAPACITY_EXCEEDED";
      expect(code).toBe("ERR_ROOM_CAPACITY_EXCEEDED");
    });

    it("instantiates RoomCapacityExceededError with proper code, status 429, and metadata", () => {
      const maxRooms = 50;
      const error = new RoomCapacityExceededError(maxRooms);

      expect(error.code).toBe("ERR_ROOM_CAPACITY_EXCEEDED");
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe("Maximum room capacity reached (50)");
      expect(error.maxRooms).toBe(50);
      expect(error.details).toEqual({ maxRooms: 50 });
      expect(error.name).toBe("RoomCapacityExceededError");
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(RoomCapacityExceededError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("2. [MAJ-008] ITimerService and TimerHandle interface contracts", () => {
    it("allows implementing a deterministic timer service conforming to ITimerService", () => {
      class VirtualTimerService implements ITimerService {
        private activeTimers = new Map<number, () => void>();
        private nextId = 1;

        public setTimeout(callback: () => void | Promise<void>, _delayMs: number): TimerHandle {
          const id = this.nextId++;
          this.activeTimers.set(id, () => { void callback(); });
          return {
            id,
            ref: () => {},
            unref: () => {},
          };
        }

        public clearTimeout(handle: TimerHandle | unknown): void {
          const timerId = typeof handle === "object" && handle !== null && "id" in handle
            ? (handle as TimerHandle).id
            : handle;
          if (typeof timerId === "number") {
            this.activeTimers.delete(timerId);
          }
        }

        public setInterval(callback: () => void | Promise<void>, intervalMs: number): TimerHandle {
          return this.setTimeout(callback, intervalMs);
        }

        public clearInterval(handle: TimerHandle | unknown): void {
          this.clearTimeout(handle);
        }

        public trigger(id: number): void {
          const cb = this.activeTimers.get(id);
          if (cb) cb();
        }
      }

      const timerService: ITimerService = new VirtualTimerService();
      let executed = false;
      const handle = timerService.setTimeout(() => {
        executed = true;
      }, 100);

      expect(handle.id).toBeDefined();
      expect(typeof handle.ref).toBe("function");
      expect(typeof handle.unref).toBe("function");

      (timerService as VirtualTimerService).trigger(handle.id as number);
      expect(executed).toBe(true);

      timerService.clearTimeout(handle);
      timerService.clearInterval(handle);
    });
  });

  describe("3. [MIN-017] Reconciled Square type and isSquare runtime guard", () => {
    it("contains exactly 64 distinct algebraic squares in SQUARES", () => {
      expect(SQUARES).toHaveLength(64);
      expect(DIRECT_SQUARES).toHaveLength(64);
      const unique = new Set(SQUARES);
      expect(unique.size).toBe(64);
    });

    it("validates all 64 squares as true using isSquare", () => {
      for (const sq of SQUARES) {
        expect(isSquare(sq)).toBe(true);
        expect(directIsSquare(sq)).toBe(true);
      }
    });

    it("validates representative squares across corners and center", () => {
      expect(isSquare("a1")).toBe(true);
      expect(isSquare("a8")).toBe(true);
      expect(isSquare("h1")).toBe(true);
      expect(isSquare("h8")).toBe(true);
      expect(isSquare("e4")).toBe(true);
      expect(isSquare("d5")).toBe(true);
    });

    it("rejects invalid square strings", () => {
      expect(isSquare("a0")).toBe(false);
      expect(isSquare("a9")).toBe(false);
      expect(isSquare("i1")).toBe(false);
      expect(isSquare("z8")).toBe(false);
      expect(isSquare("e44")).toBe(false);
      expect(isSquare("E4")).toBe(false);
      expect(isSquare("e")).toBe(false);
      expect(isSquare("4")).toBe(false);
      expect(isSquare("")).toBe(false);
      expect(isSquare("   ")).toBe(false);
      expect(isSquare("invalid")).toBe(false);
    });

    it("rejects non-string values safely", () => {
      expect(isSquare(null)).toBe(false);
      expect(isSquare(undefined)).toBe(false);
      expect(isSquare(123)).toBe(false);
      expect(isSquare(true)).toBe(false);
      expect(isSquare({})).toBe(false);
      expect(isSquare([])).toBe(false);
      expect(isSquare(Symbol("sq"))).toBe(false);
    });

    it("properly narrows unknown type to Square in TypeScript control flow", () => {
      const candidate: unknown = "c4";
      if (isSquare(candidate)) {
        const square: Square = candidate;
        expect(square).toBe("c4");
      } else {
        expect.unreachable("Type guard should have returned true");
      }
    });
  });

  describe("4. [MIN-001] BaseServerEnvSchema updates", () => {
    it("exports BaseServerEnvSchema equivalent to ServerEnvSchema", () => {
      expect(BaseServerEnvSchema).toBe(ServerEnvSchema);
      const sample: BaseServerEnv = {
        NODE_ENV: "test",
        PORT: 3000,
        HOST: "0.0.0.0",
        LOG_LEVEL: "info",
        TRUST_PROXY: false,
        RATE_LIMIT_ROOM_CREATE_MAX: 3,
      };
      expect(sample.TRUST_PROXY).toBe(false);
    });

    it("parses default values including TRUST_PROXY=false and RATE_LIMIT_ROOM_CREATE_MAX=3", () => {
      const parsed = BaseServerEnvSchema.parse({});
      expect(parsed.TRUST_PROXY).toBe(false);
      expect(parsed.RATE_LIMIT_ROOM_CREATE_MAX).toBe(3);
      expect(parsed.RATE_LIMIT_WINDOW_MS).toBeUndefined();
      expect(parsed.RATE_LIMIT_MAX_REQUESTS).toBeUndefined();
      expect(parsed.RATE_LIMIT_MAX_KEYS).toBeUndefined();
    });

    it("parses TRUST_PROXY from boolean and string variants", () => {
      expect(BaseServerEnvSchema.parse({ TRUST_PROXY: true }).TRUST_PROXY).toBe(true);
      expect(BaseServerEnvSchema.parse({ TRUST_PROXY: false }).TRUST_PROXY).toBe(false);
      expect(BaseServerEnvSchema.parse({ TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
      expect(BaseServerEnvSchema.parse({ TRUST_PROXY: "TRUE" }).TRUST_PROXY).toBe(true);
      expect(BaseServerEnvSchema.parse({ TRUST_PROXY: "1" }).TRUST_PROXY).toBe(true);
      expect(BaseServerEnvSchema.parse({ TRUST_PROXY: "false" }).TRUST_PROXY).toBe(false);
      expect(BaseServerEnvSchema.parse({ TRUST_PROXY: "0" }).TRUST_PROXY).toBe(false);
      expect(BaseServerEnvSchema.parse({ TRUST_PROXY: "unknown" }).TRUST_PROXY).toBe(false);
    });

    it("parses and coerces numeric rate limiting variables", () => {
      const parsed = BaseServerEnvSchema.parse({
        RATE_LIMIT_WINDOW_MS: "60000",
        RATE_LIMIT_MAX_REQUESTS: "100",
        RATE_LIMIT_ROOM_CREATE_MAX: "5",
        RATE_LIMIT_MAX_KEYS: "5000",
      });

      expect(parsed.RATE_LIMIT_WINDOW_MS).toBe(60000);
      expect(parsed.RATE_LIMIT_MAX_REQUESTS).toBe(100);
      expect(parsed.RATE_LIMIT_ROOM_CREATE_MAX).toBe(5);
      expect(parsed.RATE_LIMIT_MAX_KEYS).toBe(5000);
    });

    it("treats empty string rate limit values as undefined", () => {
      const parsed = BaseServerEnvSchema.parse({
        RATE_LIMIT_WINDOW_MS: "",
        RATE_LIMIT_MAX_REQUESTS: "",
        RATE_LIMIT_MAX_KEYS: "",
      });

      expect(parsed.RATE_LIMIT_WINDOW_MS).toBeUndefined();
      expect(parsed.RATE_LIMIT_MAX_REQUESTS).toBeUndefined();
      expect(parsed.RATE_LIMIT_MAX_KEYS).toBeUndefined();
      expect(parsed.RATE_LIMIT_ROOM_CREATE_MAX).toBe(3);
    });

    it("rejects non-positive rate limit options", () => {
      expect(() => BaseServerEnvSchema.parse({ RATE_LIMIT_WINDOW_MS: 0 })).toThrow();
      expect(() => BaseServerEnvSchema.parse({ RATE_LIMIT_WINDOW_MS: -100 })).toThrow();
      expect(() => BaseServerEnvSchema.parse({ RATE_LIMIT_MAX_REQUESTS: 0 })).toThrow();
      expect(() => BaseServerEnvSchema.parse({ RATE_LIMIT_ROOM_CREATE_MAX: 0 })).toThrow();
    });
  });

  describe("5. [MAJ-006] Observable diagnostics replacing empty catch blocks", () => {
    it("safeNormalizeUrl logs diagnostic details on invalid URL parse failure", () => {
      const result = safeNormalizeUrl("http://:invalid");
      expect(result).toBeUndefined();
      expect(debugSpy).toHaveBeenCalledWith(
        "safeNormalizeUrl encountered invalid URL syntax",
        expect.objectContaining({
          input: "http://:invalid",
          normalized: "http://:invalid",
          error: expect.any(String),
        }),
      );
    });

    it("safeParseUrl logs diagnostic details on invalid URL parse failure", () => {
      const result = safeParseUrl("http://:invalid");
      expect(result).toBeUndefined();
      expect(debugSpy).toHaveBeenCalledWith(
        "safeParseUrl encountered invalid URL syntax",
        expect.objectContaining({
          input: "http://:invalid",
          normalized: "http://:invalid",
          error: expect.any(String),
        }),
      );
    });

    it("safeNormalizeUrl returns undefined when URL has no hostname (e.g. file:/// protocol)", () => {
      expect(safeNormalizeUrl("file:///local/path/to/file")).toBeUndefined();
    });

    it("safeParseUrl returns undefined when URL has no hostname", () => {
      expect(safeParseUrl("file:///local/path/to/file")).toBeUndefined();
    });

    it("safeParseUrl returns undefined for non-string or empty inputs", () => {
      expect(safeParseUrl(null)).toBeUndefined();
      expect(safeParseUrl(undefined)).toBeUndefined();
      expect(safeParseUrl(123 as any)).toBeUndefined();
      expect(safeParseUrl("")).toBeUndefined();
      expect(safeParseUrl("   ")).toBeUndefined();
    });

    it("isValidFen validates standard starting position and invalid strings", () => {
      expect(isValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(true);
      expect(isValidFen("invalid-fen")).toBe(false);
      expect(isValidFen(123 as any)).toBe(false);
      expect(isValidFen("")).toBe(false);
    });

    it("safeNormalizeUrl handles non-Error thrown exception", () => {
      function FakeURL() {
        throw "String URL parse failure";
      }
      vi.spyOn(globalThis, "URL").mockImplementation(FakeURL as any);
      expect(safeNormalizeUrl("https://fun-chess.com")).toBeUndefined();
      expect(debugSpy).toHaveBeenCalledWith(
        "safeNormalizeUrl encountered invalid URL syntax",
        expect.objectContaining({
          error: "String URL parse failure",
        }),
      );
    });

    it("safeParseUrl handles non-Error thrown exception", () => {
      function FakeURL() {
        throw "String URL parse failure";
      }
      vi.spyOn(globalThis, "URL").mockImplementation(FakeURL as any);
      expect(safeParseUrl("https://fun-chess.com")).toBeUndefined();
      expect(debugSpy).toHaveBeenCalledWith(
        "safeParseUrl encountered invalid URL syntax",
        expect.objectContaining({
          error: "String URL parse failure",
        }),
      );
    });

    it("isPawnPromotion handles non-Error thrown objects gracefully", () => {
      const primitiveThrowingChess = {
        get() {
          throw "String board error";
        },
      };

      const result = isPawnPromotion("e7", "e8", primitiveThrowingChess as any);
      expect(result).toBe(false);
      expect(debugSpy).toHaveBeenCalledWith(
        "isPawnPromotion failed to get piece at square",
        expect.objectContaining({
          from: "e7",
          error: "String board error",
        }),
      );
    });
  });

  describe("6. [MIN-006] Chained error cause in progress_codec deserialization", () => {
    it("rethrows QR payload deserialization error with original syntax error as cause (progress_codec.ts:270-273)", async () => {
      // Create a compressed payload that decompresses to invalid JSON
      const invalidJsonPayload = "{ not-valid-json: true, ";
      const deflated = deflate(new TextEncoder().encode(invalidJsonPayload));
      const crc = crc32Checksum.calculate(deflated);

      const packed = new Uint8Array(4 + deflated.length);
      packed[0] = (crc >>> 24) & 0xff;
      packed[1] = (crc >>> 16) & 0xff;
      packed[2] = (crc >>> 8) & 0xff;
      packed[3] = crc & 0xff;
      packed.set(deflated, 4);

      const qrString = `${FUN_CHESS_PAYLOAD_MAGIC_PREFIX}${bytesToBase64Url(packed)}`;

      try {
        await decodeProgressFromQr(qrString);
        expect.unreachable("Should have thrown deserialization error");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Error);
        const error = err as Error;
        expect(error.message).toBe("Failed to parse decompressed JSON payload");
        expect(error.cause).toBeDefined();
        expect(error.cause).toBeInstanceOf(SyntaxError);
      }
    });

    it("rethrows envelope JSON parse error with original syntax error as cause", () => {
      try {
        decodeProgressFromEnvelope("not-valid-json");
        expect.unreachable("Should have thrown malformed JSON error");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Error);
        const error = err as Error;
        expect(error.message).toBe("Invalid envelope JSON: malformed JSON syntax");
        expect(error.cause).toBeDefined();
        expect(error.cause).toBeInstanceOf(SyntaxError);
      }
    });
  });

  describe("7. [MIN-011] Canonical SystemClock export and IClock conformance", () => {
    it("SystemClock implements IClock and returns current timestamp", () => {
      const clock: IClock = new SystemClock();
      const now = clock.now();
      expect(typeof now).toBe("number");
      expect(now).toBeGreaterThan(1700000000000);
      expect(Math.abs(now - Date.now())).toBeLessThan(100);
    });

    it("exports canonical singleton systemClock and MockClock", () => {
      expect(systemClock).toBeInstanceOf(SystemClock);
      const mock = new MockClock(5000);
      expect(mock.now()).toBe(5000);
      mock.advance(1000);
      expect(mock.now()).toBe(6000);
    });

    it("DirectClock from clock.js matches SystemClock", () => {
      expect(DirectClock).toBe(SystemClock);
      expect(DirectMockClock).toBe(MockClock);
    });
  });

  describe("8. [MIN-028] package.json engines specification", () => {
    it("defines engines with node >=22.0.0 and pnpm >=9.0.0", () => {
      const packageJsonPath = resolve(__dirname, "../../package.json");
      const content = readFileSync(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);

      expect(pkg.engines).toBeDefined();
      expect(pkg.engines.node).toBe(">=22.0.0");
      expect(pkg.engines.pnpm).toBe(">=9.0.0");
    });
  });
});
