import { describe, it, expect } from "vitest";
import { safeNormalizeUrl, safeParseUrl, normalizeUrlString } from "../url.js";

describe("URL Normalization Utilities (MIN-017)", () => {
  describe("safeNormalizeUrl", () => {
    it("preserves fully qualified https and http URLs", () => {
      expect(safeNormalizeUrl("https://fun-chess.com/play")).toBe("https://fun-chess.com/play");
      expect(safeNormalizeUrl("http://fun-chess.internal")).toBe("http://fun-chess.internal");
    });

    it("prepends http:// for localhost and 127.0.0.1 hosts missing protocol", () => {
      expect(safeNormalizeUrl("localhost:3000")).toBe("http://localhost:3000");
      expect(safeNormalizeUrl("localhost:5173/lobby")).toBe("http://localhost:5173/lobby");
      expect(safeNormalizeUrl("127.0.0.1:8080/room/1234")).toBe("http://127.0.0.1:8080/room/1234");
      expect(safeNormalizeUrl("localhost")).toBe("http://localhost");
    });

    it("prepends https:// for remote domains missing protocol", () => {
      expect(safeNormalizeUrl("chess.example.com")).toBe("https://chess.example.com");
      expect(safeNormalizeUrl("fun-chess-app.a.run.app/play")).toBe("https://fun-chess-app.a.run.app/play");
    });

    it("resolves protocol-relative URLs with https://", () => {
      expect(safeNormalizeUrl("//fun-chess.com/api")).toBe("https://fun-chess.com/api");
      expect(safeNormalizeUrl("//assets.chess.com/images")).toBe("https://assets.chess.com/images");
    });

    it("trims leading and trailing whitespace", () => {
      expect(safeNormalizeUrl("   https://chess.example.com/test   ")).toBe("https://chess.example.com/test");
      expect(safeNormalizeUrl("  localhost:3000  ")).toBe("http://localhost:3000");
    });

    it("returns undefined for empty, whitespace-only, or non-string inputs", () => {
      expect(safeNormalizeUrl("")).toBeUndefined();
      expect(safeNormalizeUrl("   ")).toBeUndefined();
      expect(safeNormalizeUrl(undefined)).toBeUndefined();
      expect(safeNormalizeUrl(null)).toBeUndefined();
      expect(safeNormalizeUrl(123 as unknown as string)).toBeUndefined();
    });

    it("returns undefined for malformed or unparsable URLs", () => {
      expect(safeNormalizeUrl("http://:invalid")).toBeUndefined();
      expect(safeNormalizeUrl(":::not a url")).toBeUndefined();
    });
  });

  describe("safeParseUrl", () => {
    it("returns a WHATWG URL instance for valid inputs", () => {
      const url = safeParseUrl("chess.example.com/play");
      expect(url).toBeInstanceOf(URL);
      expect(url?.protocol).toBe("https:");
      expect(url?.hostname).toBe("chess.example.com");
      expect(url?.pathname).toBe("/play");
    });

    it("returns URL instance for localhost inputs", () => {
      const url = safeParseUrl("localhost:3000");
      expect(url).toBeInstanceOf(URL);
      expect(url?.protocol).toBe("http:");
      expect(url?.hostname).toBe("localhost");
      expect(url?.port).toBe("3000");
    });

    it("returns undefined for invalid inputs", () => {
      expect(safeParseUrl("")).toBeUndefined();
      expect(safeParseUrl(undefined)).toBeUndefined();
      expect(safeParseUrl("http://:invalid")).toBeUndefined();
    });
  });

  describe("normalizeUrlString", () => {
    it("passes non-string inputs through unmodified", () => {
      expect(normalizeUrlString(42)).toBe(42);
      expect(normalizeUrlString(true)).toBe(true);
      expect(normalizeUrlString(null)).toBe(null);
    });

    it("normalizes string inputs", () => {
      expect(normalizeUrlString("chess.example.com")).toBe("https://chess.example.com");
      expect(normalizeUrlString("")).toBeUndefined();
    });
  });
});
