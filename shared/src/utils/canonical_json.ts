/**
 * Canonical JSON Serialization conforming to RFC 8785 (JSON Canonicalization Scheme).
 * Guarantees deterministic serialization for CRC-32 checksum computation across all runtimes.
 *
 * @see RFC 8785 (https://datatracker.ietf.org/doc/html/rfc8785)
 * @see .agentwork/db_contracts.md Section 4
 */

/**
 * Maximum recursion depth ceiling for canonical JSON serialization to prevent call stack exhaustion (MAJ-006).
 */
export const MAX_CANONICAL_JSON_DEPTH = 64;

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
 * 7. WeakSet cycle tracking to detect and reject circular references with TypeError (MAJ-006).
 * 8. Recursion depth ceiling (64 levels) to reject deeply nested payloads with RangeError (MAJ-006).
 *
 * @param value - Arbitrary JavaScript value to serialize
 * @returns Deterministic, canonical JSON string
 */
export function canonicalJsonStringify(value: unknown): string {
  return stringifyInternal(value, 0, new WeakSet<object>());
}

function stringifyInternal(value: unknown, depth: number, seen: WeakSet<object>): string {
  if (depth > MAX_CANONICAL_JSON_DEPTH) {
    throw new RangeError(
      `Maximum canonical JSON depth of ${MAX_CANONICAL_JSON_DEPTH} exceeded in canonicalJsonStringify`,
    );
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  // Handle Date objects deterministically as ISO string
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  // WeakSet cycle tracking to prevent unbounded recursion
  if (seen.has(value)) {
    throw new TypeError("Converting circular structure to JSON in canonicalJsonStringify");
  }

  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const elements = value.map((item) =>
        item === undefined || typeof item === "symbol" || typeof item === "function"
          ? "null"
          : stringifyInternal(item, depth + 1, seen),
      );
      return `[${elements.join(",")}]`;
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
      const serializedVal = stringifyInternal(val, depth + 1, seen);
      pairs.push(`${serializedKey}:${serializedVal}`);
    }

    return `{${pairs.join(",")}}`;
  } finally {
    seen.delete(value);
  }
}
