import { deflate, inflate, type DeflateOptions } from "pako";
import type {
  ProgressCodec,
  CodecEncodeOptions,
  UnifiedProgressPayload,
  UnifiedProgressEnvelope,
  CompactProgressDto,
} from "../types/progress_sync.js";
import {
  FUN_CHESS_PAYLOAD_MAGIC_PREFIX,
  UNIFIED_PROGRESS_SCHEMA_VERSION,
} from "../types/progress_sync.js";
import { crc32Checksum } from "./checksum_crc32.js";
import { defaultDictionaryMapper } from "./dictionary_mapper.js";
import { defaultSchemaValidator } from "./schema_validator.js";

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Encodes Uint8Array byte buffer to URL-safe Base64 string without padding.
 *
 * @param bytes - Input byte buffer
 * @returns Base64URL encoded string
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  let i = 0;

  for (; i + 2 < len; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1]!;
    const b2 = bytes[i + 2]!;
    result +=
      B64_CHARS[(b0 >> 2) & 0x3f] +
      B64_CHARS[((b0 & 0x03) << 4) | ((b1 >> 4) & 0x0f)] +
      B64_CHARS[((b1 & 0x0f) << 2) | ((b2 >> 6) & 0x03)] +
      B64_CHARS[b2 & 0x3f];
  }

  if (i < len) {
    const b0 = bytes[i]!;
    if (i + 1 < len) {
      const b1 = bytes[i + 1]!;
      result +=
        B64_CHARS[(b0 >> 2) & 0x3f] +
        B64_CHARS[((b0 & 0x03) << 4) | ((b1 >> 4) & 0x0f)] +
        B64_CHARS[(b1 & 0x0f) << 2];
    } else {
      result += B64_CHARS[(b0 >> 2) & 0x3f] + B64_CHARS[(b0 & 0x03) << 4];
    }
  }

  return result;
}

/**
 * Decodes Base64URL string into Uint8Array byte buffer.
 *
 * @param str - Base64URL string (with or without padding)
 * @returns Decoded byte buffer
 */
export function base64UrlToBytes(str: string): Uint8Array {
  if (!str || typeof str !== "string") return new Uint8Array(0);
  const cleanStr = str.replace(/=+$/, "").trim();
  const len = cleanStr.length;
  if (len === 0) return new Uint8Array(0);

  for (let i = 0; i < len; i++) {
    const code = cleanStr.charCodeAt(i);
    const isValid =
      (code >= 65 && code <= 90) || // A-Z
      (code >= 97 && code <= 122) || // a-z
      (code >= 48 && code <= 57) || // 0-9
      code === 45 || // -
      code === 95; // _
    if (!isValid) {
      throw new Error(
        `Invalid Base64URL character at index ${i}: '${cleanStr[i]}'`,
      );
    }
  }

  const extraChars = len % 4;
  const fullBlocks = Math.floor(len / 4);
  const outputLen =
    fullBlocks * 3 + (extraChars === 2 ? 1 : extraChars === 3 ? 2 : 0);

  const bytes = new Uint8Array(outputLen);
  let outIdx = 0;
  let inIdx = 0;

  for (let b = 0; b < fullBlocks; b++) {
    const c0 = B64_LOOKUP[cleanStr.charCodeAt(inIdx++)]!;
    const c1 = B64_LOOKUP[cleanStr.charCodeAt(inIdx++)]!;
    const c2 = B64_LOOKUP[cleanStr.charCodeAt(inIdx++)]!;
    const c3 = B64_LOOKUP[cleanStr.charCodeAt(inIdx++)]!;

    bytes[outIdx++] = (c0 << 2) | (c1 >> 4);
    bytes[outIdx++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    bytes[outIdx++] = ((c2 & 0x03) << 6) | c3;
  }

  if (extraChars === 2) {
    const c0 = B64_LOOKUP[cleanStr.charCodeAt(inIdx++)]!;
    const c1 = B64_LOOKUP[cleanStr.charCodeAt(inIdx++)]!;
    bytes[outIdx++] = (c0 << 2) | (c1 >> 4);
  } else if (extraChars === 3) {
    const c0 = B64_LOOKUP[cleanStr.charCodeAt(inIdx++)]!;
    const c1 = B64_LOOKUP[cleanStr.charCodeAt(inIdx++)]!;
    const c2 = B64_LOOKUP[cleanStr.charCodeAt(inIdx++)]!;
    bytes[outIdx++] = (c0 << 2) | (c1 >> 4);
    bytes[outIdx++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
  }

  return bytes;
}

/**
 * Production Deflate + CRC32 + Base64URL progress codec.
 * Fits complete user progress in QR Code Version 12 (~560 bytes).
 */
export class DefaultProgressCodec implements ProgressCodec {
  /**
   * Encodes domain progress payload into compact QR-compatible string (`FC1:<base64url>`).
   * Pipeline: Sanitize -> toCompact -> JSON -> Deflate -> CRC32 -> Pack -> Base64URL.
   *
   * @param payload - Domain progress payload
   * @param options - Compression options
   * @returns QR code transport string
   */
  public async encodeToQrString(
    payload: UnifiedProgressPayload,
    options?: CodecEncodeOptions,
  ): Promise<string> {
    const sanitized = defaultSchemaValidator.assertValid(payload);
    const compactDto = defaultDictionaryMapper.toCompact(sanitized);

    if (options?.clientVersion) {
      (compactDto as { c?: string }).c = options.clientVersion;
    }

    const compactJson = JSON.stringify(compactDto);
    const jsonBytes = textEncoder.encode(compactJson);

    // Deflate compression with pako (level 9 for maximum QR density)
    const compressionLevel = (options?.level ?? 9) as DeflateOptions["level"];
    const deflatedBytes = deflate(jsonBytes, { level: compressionLevel });

    // Compute CRC-32 on the deflated byte stream
    const crc = crc32Checksum.calculate(deflatedBytes);

    // Pack 4-byte big-endian CRC-32 header + deflated payload
    const packed = new Uint8Array(4 + deflatedBytes.length);
    packed[0] = (crc >>> 24) & 0xff;
    packed[1] = (crc >>> 16) & 0xff;
    packed[2] = (crc >>> 8) & 0xff;
    packed[3] = crc & 0xff;
    packed.set(deflatedBytes, 4);

    const b64 = bytesToBase64Url(packed);
    return `${FUN_CHESS_PAYLOAD_MAGIC_PREFIX}${b64}`;
  }

  /**
   * Decodes and verifies a QR code string back into a sanitized domain payload.
   * Pipeline: Check Magic -> Base64URL Decode -> Verify CRC32 -> Inflate -> fromCompact -> Sanitize.
   *
   * @param qrString - Scanned QR code transport string
   * @returns Sanitized domain progress payload
   * @throws Error if prefix missing, CRC-32 fails, or payload malformed
   */
  public async decodeFromQrString(
    qrString: string,
  ): Promise<UnifiedProgressPayload> {
    if (!qrString || typeof qrString !== "string") {
      throw new Error("Invalid QR payload: input must be a non-empty string");
    }

    if (!qrString.startsWith(FUN_CHESS_PAYLOAD_MAGIC_PREFIX)) {
      throw new Error(
        `Invalid QR payload: missing '${FUN_CHESS_PAYLOAD_MAGIC_PREFIX}' magic prefix`,
      );
    }

    const b64 = qrString.slice(FUN_CHESS_PAYLOAD_MAGIC_PREFIX.length);
    const packed = base64UrlToBytes(b64);

    if (packed.length < 5) {
      throw new Error(
        "Invalid QR payload: buffer too short to contain CRC header and compressed data",
      );
    }

    // Extract expected 4-byte CRC-32 header
    const expectedCrc =
      (((packed[0]! << 24) >>> 0) |
        ((packed[1]! << 16) >>> 0) |
        ((packed[2]! << 8) >>> 0) |
        (packed[3]! >>> 0)) >>>
      0;

    const deflatedBytes = packed.subarray(4);

    // Verify CRC-32 integrity
    const actualCrc = crc32Checksum.calculate(deflatedBytes);
    if (actualCrc !== expectedCrc) {
      throw new Error(
        `CRC-32 checksum mismatch: expected ${crc32Checksum.toHex(expectedCrc)} but calculated ${crc32Checksum.toHex(actualCrc)}. Payload data is corrupted.`,
      );
    }

    // Inflate deflated bytes
    let jsonString: string;
    try {
      const inflatedBytes = inflate(deflatedBytes);
      jsonString = textDecoder.decode(inflatedBytes);
    } catch (inflateErr) {
      throw new Error(
        `Failed to decompress Deflate stream: ${inflateErr instanceof Error ? inflateErr.message : "corrupted stream"}`,
      );
    }

    let compactDto: CompactProgressDto;
    try {
      compactDto = JSON.parse(jsonString) as CompactProgressDto;
    } catch {
      throw new Error("Failed to parse decompressed JSON payload");
    }

    const domainPayload = defaultDictionaryMapper.fromCompact(compactDto);
    return defaultSchemaValidator.assertValid(domainPayload);
  }

  /**
   * Encodes progress payload into a formatted JSON backup envelope for 1-click file export.
   *
   * @param payload - Domain progress payload
   * @returns Formatted JSON backup envelope string
   */
  public encodeToEnvelopeJson(payload: UnifiedProgressPayload): string {
    const sanitized = defaultSchemaValidator.assertValid(payload);
    const payloadJson = JSON.stringify(sanitized);
    const checksum = crc32Checksum.toHex(crc32Checksum.calculate(payloadJson));

    const envelope: UnifiedProgressEnvelope = {
      magic: "FC_PROGRESS_V1",
      schemaVersion: UNIFIED_PROGRESS_SCHEMA_VERSION,
      exportedAt: new Date(sanitized.exportedAt || Date.now()).toISOString(),
      checksum,
      payload: sanitized,
    };

    return JSON.stringify(envelope, null, 2);
  }

  /**
   * Decodes and validates a JSON backup envelope string.
   *
   * @param jsonString - Backup JSON file content
   * @returns Sanitized domain progress payload
   * @throws Error if magic invalid, CRC mismatch, or schema invalid
   */
  public decodeFromEnvelopeJson(jsonString: string): UnifiedProgressPayload {
    if (!jsonString || typeof jsonString !== "string") {
      throw new Error(
        "Invalid envelope JSON: input must be a non-empty string",
      );
    }

    let parsed: Partial<UnifiedProgressEnvelope>;
    try {
      parsed = JSON.parse(jsonString) as Partial<UnifiedProgressEnvelope>;
    } catch {
      throw new Error("Invalid envelope JSON: malformed JSON syntax");
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.magic !== "FC_PROGRESS_V1"
    ) {
      throw new Error(
        'Invalid envelope JSON: missing or incorrect "FC_PROGRESS_V1" magic identifier',
      );
    }

    if (!parsed.payload || typeof parsed.payload !== "object") {
      throw new Error("Invalid envelope JSON: missing payload object");
    }

    // Verify CRC-32 checksum
    const payloadJson = JSON.stringify(parsed.payload);
    const calculatedChecksum = crc32Checksum.toHex(
      crc32Checksum.calculate(payloadJson),
    );
    if (
      !parsed.checksum ||
      calculatedChecksum.toUpperCase() !== parsed.checksum.trim().toUpperCase()
    ) {
      throw new Error(
        `CRC-32 checksum mismatch: calculated ${calculatedChecksum} does not match expected ${parsed.checksum}`,
      );
    }

    return defaultSchemaValidator.assertValid(parsed.payload);
  }
}

/**
 * Singleton instance of DefaultProgressCodec.
 */
export const defaultProgressCodec = new DefaultProgressCodec();
export const progressCodec = defaultProgressCodec;

/**
 * Convenience helper to encode payload to QR string.
 */
export async function encodeProgressToQr(
  payload: UnifiedProgressPayload,
  options?: CodecEncodeOptions,
): Promise<string> {
  return defaultProgressCodec.encodeToQrString(payload, options);
}

/**
 * Convenience helper to decode QR string to payload.
 */
export async function decodeProgressFromQr(
  qrString: string,
): Promise<UnifiedProgressPayload> {
  return defaultProgressCodec.decodeFromQrString(qrString);
}

/**
 * Convenience helper to encode payload to JSON envelope.
 */
export function encodeProgressToEnvelope(
  payload: UnifiedProgressPayload,
): string {
  return defaultProgressCodec.encodeToEnvelopeJson(payload);
}

/**
 * Convenience helper to decode JSON envelope to payload.
 */
export function decodeProgressFromEnvelope(
  jsonString: string,
): UnifiedProgressPayload {
  return defaultProgressCodec.decodeFromEnvelopeJson(jsonString);
}
