import { describe, it, expect } from "vitest";
import { deflate } from "pako";
import {
  DefaultProgressCodec,
  progressCodec,
  decodeProgressFromQr,
  decodeProgressFromEnvelope,
  encodeProgressToQr,
  encodeProgressToEnvelope,
  bytesToBase64Url,
  base64UrlToBytes,
  MAX_DECOMPRESSED_SIZE_BYTES,
} from "../progress_codec.js";
import { crc32Checksum } from "../checksum_crc32.js";
import type { UnifiedProgressPayload } from "../../types/progress_sync.js";
import { FUN_CHESS_PAYLOAD_MAGIC_PREFIX } from "../../types/progress_sync.js";

describe("Progress Codec (Deflate + CRC-32 + Base64URL QR & JSON Envelope)", () => {
  const codec = progressCodec ?? new DefaultProgressCodec();

  const createRealisticPayload = (
    scenarioCount = 25,
    puzzleCount = 25,
  ): UnifiedProgressPayload => {
    const scenarios: UnifiedProgressPayload["scenarios"] = {};
    for (let i = 1; i <= scenarioCount; i++) {
      const id = `lesson-${i}`;
      scenarios[id] = {
        scenarioId: id,
        starsEarned: ((i % 3) + 1) as 1 | 2 | 3,
        attemptsCount: (i % 4) + 1,
        hintsUsedTotal: i % 2,
        firstCompletedAt: 1700000000000 + i * 1000,
        lastCompletedAt: 1700000000000 + i * 2000,
      };
    }

    const solvedPuzzles: UnifiedProgressPayload["puzzles"]["solvedPuzzles"] =
      {};
    for (let i = 1; i <= puzzleCount; i++) {
      const id = `puz_${i}`;
      solvedPuzzles[id] = {
        stars: ((i % 3) + 1) as 1 | 2 | 3,
        solvedAt: 1700000000000 + i * 1000,
      };
    }

    return {
      version: 1,
      exportedAt: 1700000000000,
      clientVersion: "1.0.0",
      scenarios,
      puzzles: {
        ratingProfile: {
          rating: 1350,
          ratingDeviation: 85,
          peakRating: 1420,
          totalAttempted: 50,
          totalSolved: 42,
          bestStreak: 11,
          ratingHistory: [],
        },
        themeMastery: {
          fork: {
            theme: "fork",
            attempted: 25,
            solved: 22,
            starsEarned: 35,
            masteryLevel: "master",
            lastPracticedAt: 1700000000000,
          },
          pin: {
            theme: "pin",
            attempted: 15,
            solved: 12,
            starsEarned: 18,
            masteryLevel: "apprentice",
            lastPracticedAt: 1700000000000,
          },
          skewer: {
            theme: "skewer",
            attempted: 5,
            solved: 4,
            starsEarned: 6,
            masteryLevel: "novice",
            lastPracticedAt: 1700000000000,
          },
        },
        arcadeStats: {
          puzzleRushHighScore: 25,
          puzzleRushBestStreak: 9,
          streakSurvivorHighScore: 18,
          totalRushRuns: 12,
        },
        solvedPuzzles,
        createdAt: 1690000000000,
        lastActiveAt: 1700000000000,
      },
    };
  };

  describe("QR Compression & Round-Trip Fidelity", () => {
    it("encodes domain progress to compact QR string prefixed with FC1:", async () => {
      // Arrange
      const payload = createRealisticPayload(20, 20);

      // Act
      const qrString = await codec.encodeToQrString(payload);

      // Assert
      expect(qrString.startsWith(FUN_CHESS_PAYLOAD_MAGIC_PREFIX)).toBe(true);
      const body = qrString.slice(FUN_CHESS_PAYLOAD_MAGIC_PREFIX.length);
      // Valid unpadded Base64URL characters (A-Z, a-z, 0-9, -, _)
      expect(/^[A-Za-z0-9_-]+$/.test(body)).toBe(true);
    });

    it("achieves full lossless round-trip decoding from QR string back to domain payload", async () => {
      // Arrange
      const original = createRealisticPayload(30, 30);

      // Act
      const qrString = await codec.encodeToQrString(original);
      const decoded = await codec.decodeFromQrString(qrString);

      // Assert
      expect(decoded.version).toBe(original.version);
      expect(decoded.exportedAt).toBe(original.exportedAt);
      expect(decoded.clientVersion).toBe(original.clientVersion);

      // Verify scenarios
      expect(Object.keys(decoded.scenarios)).toHaveLength(30);
      expect(decoded.scenarios["lesson-1"]).toEqual(
        original.scenarios["lesson-1"],
      );
      expect(decoded.scenarios["lesson-30"]).toEqual(
        original.scenarios["lesson-30"],
      );

      // Verify rating profile & stats
      expect(decoded.puzzles.ratingProfile.rating).toBe(
        original.puzzles.ratingProfile.rating,
      );
      expect(decoded.puzzles.ratingProfile.ratingDeviation).toBe(
        original.puzzles.ratingProfile.ratingDeviation,
      );
      expect(decoded.puzzles.ratingProfile.peakRating).toBe(
        original.puzzles.ratingProfile.peakRating,
      );
      expect(decoded.puzzles.arcadeStats).toEqual(original.puzzles.arcadeStats);

      // Verify solved puzzles and theme mastery
      expect(Object.keys(decoded.puzzles.solvedPuzzles)).toHaveLength(30);
      expect(decoded.puzzles.themeMastery["fork"]?.starsEarned).toBe(35);
      expect(decoded.puzzles.themeMastery["pin"]?.starsEarned).toBe(18);
      expect(decoded.puzzles.themeMastery["skewer"]?.starsEarned).toBe(6);
    });

    it("produces QR string fitting QR Code Version 12 capacity (~686 chars) for typical progress (25 scenarios + 25 solved puzzles)", async () => {
      // Arrange
      const payload = createRealisticPayload(25, 25);

      // Act: Level 9 maximum deflate compression
      const qrString = await codec.encodeToQrString(payload, { level: 9 });

      // Assert: Fits QR Code Version 12 capacity (~686 alphanumeric chars)
      expect(qrString.length).toBeLessThan(700);
    });
  });

  describe("Magic Prefix & Format Validation", () => {
    it("rejects QR string missing FC1: prefix", async () => {
      // Arrange
      const payload = createRealisticPayload(5, 5);
      const qrString = await codec.encodeToQrString(payload);
      const rawBase64 = qrString.slice(FUN_CHESS_PAYLOAD_MAGIC_PREFIX.length);

      // Act & Assert
      await expect(codec.decodeFromQrString(rawBase64)).rejects.toThrowError(
        /FC1:/,
      );
    });

    it("rejects QR string with incompatible magic prefix", async () => {
      // Arrange
      const payload = createRealisticPayload(5, 5);
      const qrString = await codec.encodeToQrString(payload);
      const wrongPrefix = qrString.replace(
        FUN_CHESS_PAYLOAD_MAGIC_PREFIX,
        "FC2:",
      );

      // Act & Assert
      await expect(codec.decodeFromQrString(wrongPrefix)).rejects.toThrowError(
        /FC1:/,
      );
    });

    it("rejects empty or non-string inputs", async () => {
      // Act & Assert
      await expect(codec.decodeFromQrString("")).rejects.toThrow();
      await expect(
        codec.decodeFromQrString(null as unknown as string),
      ).rejects.toThrow();
    });

    it("rejects Base64URL string containing invalid non-URL-safe characters or corrupted data", async () => {
      // Arrange: '+' and '/' are standard Base64 but invalid in Base64URL
      const invalidCharsPayload = `${FUN_CHESS_PAYLOAD_MAGIC_PREFIX}abc+def/123==`;

      // Act & Assert
      await expect(
        codec.decodeFromQrString(invalidCharsPayload),
      ).rejects.toThrow();
    });
  });

  describe("Tamper & Corruption Detection in QR Stream", () => {
    it("detects single-character tampering in QR Base64URL payload and rejects", async () => {
      // Arrange
      const payload = createRealisticPayload(10, 10);
      const qrString = await codec.encodeToQrString(payload);
      const prefix = FUN_CHESS_PAYLOAD_MAGIC_PREFIX;
      const body = qrString.slice(prefix.length);

      // Tamper: Flip character at middle index
      const midIdx = Math.floor(body.length / 2);
      const originalChar = body[midIdx];
      const corruptedChar = originalChar === "A" ? "B" : "A";
      const tamperedQr = `${prefix}${body.substring(0, midIdx)}${corruptedChar}${body.substring(midIdx + 1)}`;

      // Act & Assert: CRC-32 integrity mismatch or decompression error
      await expect(codec.decodeFromQrString(tamperedQr)).rejects.toThrow();
    });

    it("detects truncated payload stream and rejects", async () => {
      // Arrange
      const payload = createRealisticPayload(10, 10);
      const qrString = await codec.encodeToQrString(payload);
      const truncated = qrString.slice(0, 10);

      // Act & Assert
      await expect(codec.decodeFromQrString(truncated)).rejects.toThrow();
    });
  });

  describe("Decompression Error Handling & Bomb Protection (MIN-002, MIN-028)", () => {
    it("exports MAX_DECOMPRESSED_SIZE_BYTES configured to 5MB limit", () => {
      expect(MAX_DECOMPRESSED_SIZE_BYTES).toBe(5 * 1024 * 1024);
    });

    it("guards against decompression bomb payloads exceeding 5MB decompressed size limit", async () => {
      // 5.5MB of repeating zero bytes compresses to only a few KB with Deflate
      const bombData = new Uint8Array(5.5 * 1024 * 1024);
      const deflated = deflate(bombData);
      const crc = crc32Checksum.calculate(deflated);

      const packed = new Uint8Array(4 + deflated.length);
      packed[0] = (crc >>> 24) & 0xff;
      packed[1] = (crc >>> 16) & 0xff;
      packed[2] = (crc >>> 8) & 0xff;
      packed[3] = crc & 0xff;
      packed.set(deflated, 4);

      const bombQr = `${FUN_CHESS_PAYLOAD_MAGIC_PREFIX}${bytesToBase64Url(packed)}`;

      await expect(codec.decodeFromQrString(bombQr)).rejects.toThrowError(
        /Failed to decompress Deflate stream: Decompressed payload exceeds maximum size limit/,
      );
    });

    it("rejects corrupted Deflate stream with descriptive error when CRC matches but inflation fails", async () => {
      // Invalid deflate payload where CRC-32 header matches but deflate stream itself is malformed
      const invalidDeflate = new Uint8Array([0x1f, 0x8b, 0x00, 0x99, 0x88, 0x77, 0x66, 0x55]);
      const crc = crc32Checksum.calculate(invalidDeflate);

      const packed = new Uint8Array(4 + invalidDeflate.length);
      packed[0] = (crc >>> 24) & 0xff;
      packed[1] = (crc >>> 16) & 0xff;
      packed[2] = (crc >>> 8) & 0xff;
      packed[3] = crc & 0xff;
      packed.set(invalidDeflate, 4);

      const corruptedQr = `${FUN_CHESS_PAYLOAD_MAGIC_PREFIX}${bytesToBase64Url(packed)}`;

      await expect(codec.decodeFromQrString(corruptedQr)).rejects.toThrowError(
        /Failed to decompress Deflate stream/,
      );
    });

    it("rejects payloads that decompress into invalid JSON", async () => {
      const invalidJsonText = "Not a valid json { foo:";
      const textBytes = new TextEncoder().encode(invalidJsonText);
      const deflated = deflate(textBytes);
      const crc = crc32Checksum.calculate(deflated);

      const packed = new Uint8Array(4 + deflated.length);
      packed[0] = (crc >>> 24) & 0xff;
      packed[1] = (crc >>> 16) & 0xff;
      packed[2] = (crc >>> 8) & 0xff;
      packed[3] = crc & 0xff;
      packed.set(deflated, 4);

      const invalidJsonQr = `${FUN_CHESS_PAYLOAD_MAGIC_PREFIX}${bytesToBase64Url(packed)}`;

      await expect(codec.decodeFromQrString(invalidJsonQr)).rejects.toThrowError(
        /Failed to parse decompressed JSON payload/,
      );
    });
  });

  describe("JSON Backup Envelope Export & Import", () => {
    it("encodes and decodes JSON backup envelope with valid CRC-32 checksum", () => {
      // Arrange
      const payload = createRealisticPayload(15, 15);

      // Act
      const envelopeJson = codec.encodeToEnvelopeJson(payload);
      const parsedEnvelope = JSON.parse(envelopeJson);
      const decoded = codec.decodeFromEnvelopeJson(envelopeJson);

      // Assert
      expect(parsedEnvelope.magic).toBe("FC_PROGRESS_V1");
      expect(parsedEnvelope.schemaVersion).toBe(1);
      expect(parsedEnvelope.checksum).toHaveLength(8);
      expect(typeof parsedEnvelope.exportedAt).toBe("string");

      expect(decoded.puzzles.ratingProfile.rating).toBe(
        payload.puzzles.ratingProfile.rating,
      );
      expect(decoded.scenarios["lesson-1"]).toEqual(
        payload.scenarios["lesson-1"],
      );
      expect(Object.keys(decoded.scenarios)).toHaveLength(15);
    });

    it("rejects tampered JSON backup envelope with checksum mismatch error", () => {
      // Arrange
      const payload = createRealisticPayload(10, 10);
      const envelopeJson = codec.encodeToEnvelopeJson(payload);
      const envelopeObj = JSON.parse(envelopeJson);

      // Tamper: maliciously edit rating inside payload
      envelopeObj.payload.puzzles.ratingProfile.rating = 2999;
      const tamperedJson = JSON.stringify(envelopeObj);

      // Act & Assert
      expect(() => codec.decodeFromEnvelopeJson(tamperedJson)).toThrowError(
        /CRC-32 checksum mismatch/,
      );
    });

    it("rejects JSON backup envelope with invalid or missing magic identifier", () => {
      // Arrange
      const payload = createRealisticPayload(5, 5);
      const envelopeJson = codec.encodeToEnvelopeJson(payload);
      const envelopeObj = JSON.parse(envelopeJson);

      envelopeObj.magic = "WRONG_MAGIC";
      const badMagicJson = JSON.stringify(envelopeObj);

      // Act & Assert
      expect(() => codec.decodeFromEnvelopeJson(badMagicJson)).toThrowError(
        /magic identifier/,
      );
    });

    it("rejects non-JSON or malformed JSON envelope strings", () => {
      // Act & Assert
      expect(() => codec.decodeFromEnvelopeJson("not a json")).toThrow();
      expect(() => codec.decodeFromEnvelopeJson("")).toThrow();
    });
  });

  describe("Standalone Helper Functions (decodeProgressFromQr, decodeProgressFromEnvelope, encodeProgressToQr, encodeProgressToEnvelope)", () => {
    it("encodes and decodes QR string via standalone helper functions", async () => {
      const payload = createRealisticPayload(10, 10);
      const qr = await encodeProgressToQr(payload);
      expect(qr.startsWith(FUN_CHESS_PAYLOAD_MAGIC_PREFIX)).toBe(true);

      const decoded = await decodeProgressFromQr(qr);
      expect(decoded.version).toBe(payload.version);
      expect(decoded.puzzles.ratingProfile.rating).toBe(
        payload.puzzles.ratingProfile.rating,
      );
      expect(Object.keys(decoded.scenarios)).toHaveLength(10);
    });

    it("encodes and decodes JSON envelope via standalone helper functions", () => {
      const payload = createRealisticPayload(8, 8);
      const envelopeJson = encodeProgressToEnvelope(payload);
      expect(envelopeJson).toContain("FC_PROGRESS_V1");

      const decoded = decodeProgressFromEnvelope(envelopeJson);
      expect(decoded.version).toBe(payload.version);
      expect(decoded.puzzles.ratingProfile.rating).toBe(
        payload.puzzles.ratingProfile.rating,
      );
      expect(Object.keys(decoded.scenarios)).toHaveLength(8);
    });

    it("round-trips bytesToBase64Url and base64UrlToBytes", () => {
      const testBytes = new Uint8Array([1, 2, 3, 4, 255, 128, 0, 42, 99]);
      const b64 = bytesToBase64Url(testBytes);
      expect(typeof b64).toBe("string");
      const decodedBytes = base64UrlToBytes(b64);
      expect(decodedBytes).toEqual(testBytes);
    });

    it("base64UrlToBytes handles empty and whitespace strings gracefully", () => {
      expect(base64UrlToBytes("")).toEqual(new Uint8Array(0));
      expect(base64UrlToBytes("   ")).toEqual(new Uint8Array(0));
      expect(base64UrlToBytes(null as unknown as string)).toEqual(
        new Uint8Array(0),
      );
    });
  });
});
