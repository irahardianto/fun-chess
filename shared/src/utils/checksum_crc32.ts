import type { ChecksumCrc32 } from "../types/progress_sync.js";

/**
 * Precomputed 256-entry lookup table for IEEE 802.3 CRC-32 polynomial (0xEDB88320).
 */
const CRC_TABLE = new Uint32Array(256);

// Initialize IEEE 802.3 CRC-32 lookup table once at module load
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

const textEncoder = new TextEncoder();

/**
 * Pure, high-performance IEEE 802.3 32-bit CRC calculation and verification engine.
 * Polynomial: 0xEDB88320.
 * Operates without external dependencies.
 */
export class Crc32Checksum implements ChecksumCrc32 {
  /**
   * Calculates unsigned 32-bit integer CRC-32 for byte array or UTF-8 string.
   *
   * @param input - Byte buffer or string to compute checksum for
   * @returns Unsigned 32-bit integer (0x00000000 to 0xFFFFFFFF)
   */
  public calculate(input: Uint8Array | string): number {
    const bytes = typeof input === "string" ? textEncoder.encode(input) : input;
    if (bytes.length === 0) {
      return 0;
    }

    let crc = 0xffffffff;
    const len = bytes.length;
    for (let i = 0; i < len; i++) {
      const byte = bytes[i]!;
      crc = (CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  /**
   * Formats unsigned 32-bit integer CRC into standard 8-character uppercase hex string.
   *
   * @param crc - 32-bit unsigned integer
   * @returns 8-character zero-padded uppercase hex string (e.g. "CBF43926")
   */
  public toHex(crc: number): string {
    return (crc >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }

  /**
   * Verifies data integrity against an expected 8-character hex checksum (case-insensitive).
   *
   * @param input - Byte buffer or string
   * @param expectedHex - Expected 8-character hexadecimal checksum
   * @returns True if calculated checksum matches expectedHex
   */
  public verify(input: Uint8Array | string, expectedHex: string): boolean {
    if (!expectedHex || typeof expectedHex !== "string") {
      return false;
    }
    const computedHex = this.toHex(this.calculate(input));
    return computedHex === expectedHex.trim().toUpperCase();
  }
}

/**
 * Singleton instance of Crc32Checksum.
 */
export const crc32Checksum = new Crc32Checksum();
export const crc32 = crc32Checksum;

/**
 * Convenience helper to calculate 32-bit unsigned integer CRC-32.
 */
export function calculateCrc32(input: Uint8Array | string): number {
  return crc32Checksum.calculate(input);
}

/**
 * Convenience helper to format CRC-32 integer as 8-character uppercase hex string.
 */
export function crc32ToHex(crc: number): string {
  return crc32Checksum.toHex(crc);
}

/**
 * Convenience helper to verify input against expected hex checksum.
 */
export function verifyCrc32(
  input: Uint8Array | string,
  expectedHex: string,
): boolean {
  return crc32Checksum.verify(input, expectedHex);
}
