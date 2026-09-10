import { describe, it, expect } from "vitest";
import {
  deriveSessionKey,
  generateSessionToken,
  signSessionToken,
  verifySessionToken,
  isValidSessionToken,
  parseSessionToken,
  maskToken,
  maskSessionToken,
  tokenFingerprint,
} from "../session_token.js";

describe("HMAC-SHA256 Session Token Utilities (MAJ-004, CRIT-002)", () => {
  const testSecret = ["super", "secure", "production", "secret", "32b"].join("-");
  const testUuid = "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d";

  describe("deriveSessionKey", () => {
    it("derives a 32-byte Buffer from a secret string", () => {
      const key = deriveSessionKey(testSecret);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it("is referentially deterministic for identical secrets", () => {
      const key1 = deriveSessionKey("consistent-secret");
      const key2 = deriveSessionKey("consistent-secret");
      expect(key1.equals(key2)).toBe(true);
    });
  });

  describe("generateSessionToken / signSessionToken", () => {
    it("generates a 101-character dot-delimited signed token", () => {
      const token = generateSessionToken(testUuid, testSecret);

      expect(token).toHaveLength(101);
      const [uuid, signature] = token.split(".");
      expect(uuid).toBe(testUuid);
      expect(signature).toHaveLength(64);
      expect(signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it("signSessionToken produces identical result to generateSessionToken", () => {
      const t1 = generateSessionToken(testUuid, testSecret);
      const t2 = signSessionToken(testUuid, testSecret);
      expect(t1).toBe(t2);
    });

    it("throws an error if secret is missing or empty", () => {
      expect(() => generateSessionToken(testUuid, "")).toThrow(
        "Cannot sign session token: sessionSecret is required",
      );
      expect(() => generateSessionToken(testUuid, undefined as unknown as string)).toThrow(
        "Cannot sign session token: sessionSecret is required",
      );
    });

    it("throws an error if UUID is invalid", () => {
      expect(() => generateSessionToken("not-a-uuid", testSecret)).toThrow(
        "Cannot sign session token: uuid must be a valid RFC 4122 UUID v4",
      );
      expect(() => generateSessionToken("", testSecret)).toThrow(
        "Cannot sign session token: uuid must be a valid RFC 4122 UUID v4",
      );
    });
  });

  describe("verifySessionToken", () => {
    it("verifies a legitimate token successfully and extracts the uuid", () => {
      const token = generateSessionToken(testUuid, testSecret);
      const result = verifySessionToken(token, testSecret);

      expect(result.valid).toBe(true);
      expect(result.uuid).toBe(testUuid);
      expect(result.reason).toBeUndefined();
    });

    it("rejects a token with an invalid signature (tampered signature)", () => {
      const token = generateSessionToken(testUuid, testSecret);
      const [uuid, sig] = token.split(".");
      const tamperedSig = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
      const tamperedToken = `${uuid}.${tamperedSig}`;

      const result = verifySessionToken(tamperedToken, testSecret);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_signature");
    });

    it("rejects a token signed with a different secret", () => {
      const token = generateSessionToken(testUuid, testSecret);
      const result = verifySessionToken(token, "different-session-secret-key-32b!!");

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_signature");
    });

    it("rejects a token when secret is missing or empty", () => {
      const token = generateSessionToken(testUuid, testSecret);
      expect(verifySessionToken(token, "")).toEqual({
        valid: false,
        reason: "missing_secret",
      });
      expect(verifySessionToken(token, undefined as unknown as string)).toEqual({
        valid: false,
        reason: "missing_secret",
      });
    });

    it("rejects malformed token strings", () => {
      expect(verifySessionToken("malformed", testSecret)).toEqual({
        valid: false,
        reason: "invalid_format",
      });
      expect(verifySessionToken("", testSecret)).toEqual({
        valid: false,
        reason: "invalid_format",
      });
      expect(verifySessionToken(null as unknown as string, testSecret)).toEqual({
        valid: false,
        reason: "invalid_format",
      });
      expect(verifySessionToken("uuid.sig.extra", testSecret)).toEqual({
        valid: false,
        reason: "invalid_format",
      });
      expect(verifySessionToken(`${testUuid}.shortsignature`, testSecret)).toEqual({
        valid: false,
        reason: "invalid_format",
      });
      expect(verifySessionToken(`not-a-uuid.${"a".repeat(64)}`, testSecret)).toEqual({
        valid: false,
        reason: "invalid_format",
      });
    });

    describe("allowUnsignedInDev option", () => {
      it("accepts a raw UUIDv4 when allowUnsignedInDev is true", () => {
        const rawUuid = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
        const result = verifySessionToken(rawUuid, testSecret, { allowUnsignedInDev: true });

        expect(result.valid).toBe(true);
        expect(result.uuid).toBe(rawUuid);
      });

      it("rejects a raw UUIDv4 when allowUnsignedInDev is false or omitted", () => {
        const rawUuid = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
        const res1 = verifySessionToken(rawUuid, testSecret);
        const res2 = verifySessionToken(rawUuid, testSecret, { allowUnsignedInDev: false });

        expect(res1.valid).toBe(false);
        expect(res1.reason).toBe("invalid_format");
        expect(res2.valid).toBe(false);
        expect(res2.reason).toBe("invalid_format");
      });
    });
  });

  describe("isValidSessionToken helper", () => {
    it("returns boolean true for valid tokens and false for invalid ones", () => {
      const token = generateSessionToken(testUuid, testSecret);
      expect(isValidSessionToken(token, testSecret)).toBe(true);
      expect(isValidSessionToken("invalid", testSecret)).toBe(false);
    });
  });

  describe("parseSessionToken", () => {
    it("parses valid signed token into sessionId and signature", () => {
      const token = generateSessionToken(testUuid, testSecret);
      const parsed = parseSessionToken(token);

      expect(parsed).not.toBeNull();
      expect(parsed?.sessionId).toBe(testUuid);
      expect(parsed?.signature).toHaveLength(64);
    });

    it("returns null for malformed tokens", () => {
      expect(parseSessionToken("")).toBeNull();
      expect(parseSessionToken("just-a-string")).toBeNull();
      expect(parseSessionToken("uuid.invalidlength")).toBeNull();
    });
  });

  describe("maskToken and maskSessionToken (CRIT-002)", () => {
    it("masks session tokens preserving 8 leading and 6 trailing characters", () => {
      const token = generateSessionToken(testUuid, testSecret);
      const masked = maskToken(token);

      expect(masked).toBe(`${token.slice(0, 8)}...${token.slice(-6)}`);
      expect(maskSessionToken(token)).toBe(masked);
      expect(masked).not.toContain(token);
    });

    it("returns [REDACTED] for missing or short tokens", () => {
      expect(maskToken("")).toBe("[REDACTED]");
      expect(maskToken("short")).toBe("[REDACTED]");
      expect(maskToken(null as unknown as string)).toBe("[REDACTED]");
    });
  });

  describe("tokenFingerprint (CRIT-002)", () => {
    it("produces a deterministic 10-character SHA-256 fingerprint", () => {
      const token = generateSessionToken(testUuid, testSecret);
      const fp1 = tokenFingerprint(token);
      const fp2 = tokenFingerprint(token);

      expect(fp1).toHaveLength(10);
      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^[0-9a-f]{10}$/);
    });

    it("returns empty string for missing or invalid inputs", () => {
      expect(tokenFingerprint("")).toBe("");
      expect(tokenFingerprint(null as unknown as string)).toBe("");
    });
  });
});
