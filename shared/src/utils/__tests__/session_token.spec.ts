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

  describe("Stateless Token Expiration Timestamp (ENH-002)", () => {
    const fixedNow = 1750000000000;
    const futureExpiry = fixedNow + 3600000; // +1 hour

    it("generates a 3-part dot-delimited signed token when expiresAt is provided as a number", () => {
      const token = generateSessionToken(testUuid, testSecret, futureExpiry);
      const parts = token.split(".");

      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe(testUuid);
      expect(parts[1]).toBe(String(futureExpiry));
      expect(parts[2]).toHaveLength(64);
      expect(parts[2]).toMatch(/^[0-9a-f]{64}$/);
    });

    it("generates a 3-part token when expiresAt is provided in options object", () => {
      const token = generateSessionToken(testUuid, testSecret, { expiresAt: futureExpiry });
      const parts = token.split(".");

      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe(testUuid);
      expect(parts[1]).toBe(String(futureExpiry));
      expect(parts[2]).toHaveLength(64);
    });

    it("signSessionToken supports options with expiresAt", () => {
      const token = signSessionToken(testUuid, testSecret, { expiresAt: futureExpiry });
      const parsed = parseSessionToken(token);

      expect(parsed).not.toBeNull();
      expect(parsed?.sessionId).toBe(testUuid);
      expect(parsed?.expiresAt).toBe(futureExpiry);
    });

    it("throws when invalid expiresAt is provided", () => {
      expect(() => generateSessionToken(testUuid, testSecret, -1000)).toThrow(
        "Cannot sign session token: expiresAt must be a positive integer timestamp",
      );
      expect(() => generateSessionToken(testUuid, testSecret, 0)).toThrow(
        "Cannot sign session token: expiresAt must be a positive integer timestamp",
      );
      expect(() => generateSessionToken(testUuid, testSecret, 1.234)).toThrow(
        "Cannot sign session token: expiresAt must be a positive integer timestamp",
      );
      expect(() => generateSessionToken(testUuid, testSecret, { expiresAt: NaN })).toThrow(
        "Cannot sign session token: expiresAt must be a positive integer timestamp",
      );
    });

    it("parses 3-part token correctly into sessionId, signature, and expiresAt", () => {
      const token = generateSessionToken(testUuid, testSecret, futureExpiry);
      const parsed = parseSessionToken(token);

      expect(parsed).toEqual({
        sessionId: testUuid,
        signature: expect.stringMatching(/^[0-9a-f]{64}$/),
        expiresAt: futureExpiry,
      });
    });

    it("returns null when parsing 3-part token with non-numeric or malformed expiresAt", () => {
      expect(parseSessionToken(`${testUuid}.notanumber.${"a".repeat(64)}`)).toBeNull();
      expect(parseSessionToken(`${testUuid}.-500.${"a".repeat(64)}`)).toBeNull();
      expect(parseSessionToken(`${testUuid}.123.456.${"a".repeat(64)}`)).toBeNull();
    });

    it("verifies unexpired 3-part token successfully with custom now option", () => {
      const token = generateSessionToken(testUuid, testSecret, futureExpiry);
      const result = verifySessionToken(token, testSecret, { now: fixedNow });

      expect(result.valid).toBe(true);
      expect(result.uuid).toBe(testUuid);
      expect(result.expiresAt).toBe(futureExpiry);
      expect(result.reason).toBeUndefined();
    });

    it("rejects expired 3-part token when now is at or after expiresAt", () => {
      const token = generateSessionToken(testUuid, testSecret, futureExpiry);
      const resultAtExpiry = verifySessionToken(token, testSecret, { now: futureExpiry });
      const resultAfterExpiry = verifySessionToken(token, testSecret, { now: futureExpiry + 1000 });

      expect(resultAtExpiry.valid).toBe(false);
      expect(resultAtExpiry.reason).toBe("expired");
      expect(resultAtExpiry.uuid).toBe(testUuid);
      expect(resultAtExpiry.expiresAt).toBe(futureExpiry);

      expect(resultAfterExpiry.valid).toBe(false);
      expect(resultAfterExpiry.reason).toBe("expired");
    });

    it("rejects 3-part token if expiration timestamp is tampered with (fails HMAC check)", () => {
      const token = generateSessionToken(testUuid, testSecret, futureExpiry);
      const [uuid, , signature] = token.split(".");
      const extendedExpiry = futureExpiry + 86400000; // Attacker tries to extend expiry by 1 day
      const tamperedToken = `${uuid}.${extendedExpiry}.${signature}`;

      const result = verifySessionToken(tamperedToken, testSecret, { now: fixedNow });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_signature");
    });

    it("preserves backward compatibility for 2-part tokens without expiresAt", () => {
      const legacyToken = generateSessionToken(testUuid, testSecret);
      const parsed = parseSessionToken(legacyToken);
      expect(parsed?.expiresAt).toBeUndefined();

      const verification = verifySessionToken(legacyToken, testSecret, { now: futureExpiry + 999999 });
      expect(verification.valid).toBe(true);
      expect(verification.uuid).toBe(testUuid);
      expect(verification.expiresAt).toBeUndefined();
    });
  });
});
