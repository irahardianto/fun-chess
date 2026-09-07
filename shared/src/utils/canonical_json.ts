/**
 * Canonical JSON Serialization conforming to RFC 8785 (JSON Canonicalization Scheme).
 * Guarantees deterministic serialization for CRC-32 checksum computation across all runtimes.
 *
 * @see RFC 8785 (https://datatracker.ietf.org/doc/html/rfc8785)
 * @see .agentwork/db_contracts.md Section 4
 */

/**
 * Serializes any JavaScript value to a deterministic, canonical JSON string
 * conforming to RFC 8785 (JSON Canonicalization Scheme).
 *
 * Requirements:
 * 1. Lexicographical key sorting in ascending Unicode code point order (UTF-16 code units via sort()).
 * 2. Delimiters are compact with zero whitespace after ':' or ','.
 * 3. Omit undefined, symbol, and function values in objects.
 * 4. In arrays, serialize undefined/symbol/function as null.
 * 5. Format Date instances deterministically as ISO strings (JSON.stringify(d.toISOString())).
 * 6. Deterministic primitive formatting.
 *
 * @param value - Arbitrary JavaScript value to serialize
 * @returns Deterministic, canonical JSON string
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    const elements = value.map((item) =>
      item === undefined || typeof item === "symbol" || typeof item === "function"
        ? "null"
        : canonicalJsonStringify(item),
    );
    return `[${elements.join(",")}]`;
  }

  // Handle Date objects deterministically as ISO string
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  // Object key sorting in lexicographical Unicode order
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();

  const pairs: string[] = [];
  for (const key of sortedKeys) {
    const val = obj[key];
    // Skip undefined, functions, and symbols per JSON Canonicalization Scheme
    if (val === undefined || typeof val === "function" || typeof val === "symbol") {
      continue;
    }
    const serializedKey = JSON.stringify(key);
    const serializedVal = canonicalJsonStringify(val);
    pairs.push(`${serializedKey}:${serializedVal}`);
  }

  return `{${pairs.join(",")}}`;
}
