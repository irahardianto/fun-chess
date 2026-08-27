import { describe, it, expect } from "vitest";
import {
  Crc32Checksum,
  crc32,
  calculateCrc32,
  crc32ToHex,
  verifyCrc32,
} from "../checksum_crc32.js";

describe("ChecksumCrc32 Unit Tests", () => {
  it('should match standard IEEE 802.3 test vector "123456789" -> 0xCBF43926', () => {
    // Arrange
    const input = "123456789";
    const expectedInt = 3421780262; // 0xCBF43926
    const expectedHex = "CBF43926";

    // Act
    const calculatedInt = crc32.calculate(input);
    const calculatedHex = crc32.toHex(calculatedInt);

    // Assert
    expect(calculatedInt).toBe(expectedInt);
    expect(calculatedHex).toBe(expectedHex);
    expect(crc32.verify(input, expectedHex)).toBe(true);
  });

  it("should return 0x00000000 for empty string and empty Uint8Array", () => {
    // Arrange
    const emptyStr = "";
    const emptyBytes = new Uint8Array(0);

    // Act
    const strCrc = crc32.calculate(emptyStr);
    const bytesCrc = crc32.calculate(emptyBytes);

    // Assert
    expect(strCrc).toBe(0);
    expect(bytesCrc).toBe(0);
    expect(crc32.toHex(strCrc)).toBe("00000000");
    expect(crc32.verify(emptyStr, "00000000")).toBe(true);
  });

  it("should correctly calculate CRC-32 for multi-byte UTF-8 Unicode characters and emojis", () => {
    // Arrange
    const unicodeInput = "♟️ Fun Chess - Kid Learning & Sync 🚀";

    // Act
    const crcVal = crc32.calculate(unicodeInput);
    const hexVal = crc32.toHex(crcVal);

    // Assert
    expect(crcVal).toBeGreaterThan(0);
    expect(hexVal).toHaveLength(8);
    expect(crc32.verify(unicodeInput, hexVal)).toBe(true);
  });

  it("should detect 1-bit / 1-byte corruption and reject verification", () => {
    // Arrange
    const original = '{"version":1,"rating":1200,"stars":3}';
    const originalHex = crc32.toHex(crc32.calculate(original));

    // Act: Corrupt a single byte
    const corrupted = '{"version":1,"rating":1201,"stars":3}';
    const corruptedHex = crc32.toHex(crc32.calculate(corrupted));

    // Assert
    expect(corruptedHex).not.toBe(originalHex);
    expect(crc32.verify(corrupted, originalHex)).toBe(false);
  });

  it("should always format 8-character zero-padded uppercase hex", () => {
    // Arrange
    const customEngine = new Crc32Checksum();

    // Act & Assert
    expect(customEngine.toHex(0)).toBe("00000000");
    expect(customEngine.toHex(0x1a)).toBe("0000001A");
    expect(customEngine.toHex(0xffffffff)).toBe("FFFFFFFF");
  });

  it("should perform case-insensitive hex verification in verify()", () => {
    // Arrange
    const input = "fun-chess-save-payload";
    const upperHex = crc32.toHex(crc32.calculate(input));
    const lowerHex = upperHex.toLowerCase();

    // Act & Assert
    expect(crc32.verify(input, upperHex)).toBe(true);
    expect(crc32.verify(input, lowerHex)).toBe(true);
    expect(crc32.verify(input, `  ${upperHex}  `)).toBe(true);
  });

  it("should verify class instance and functional helpers produce identical results", () => {
    // Arrange
    const sample = "functional-api-test-string";

    // Act
    const classVal = crc32.calculate(sample);
    const fnVal = calculateCrc32(sample);
    const classHex = crc32.toHex(classVal);
    const fnHex = crc32ToHex(fnVal);

    // Assert
    expect(fnVal).toBe(classVal);
    expect(fnHex).toBe(classHex);
    expect(verifyCrc32(sample, fnHex)).toBe(true);
  });
});
