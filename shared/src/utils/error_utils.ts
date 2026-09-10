/**
 * Standardized error serialization and formatting utilities.
 * Conforms to .agentwork/project_conventions.md Section 2 (MAJ-022).
 */

export interface SerializedError {
  name?: string;
  message: string;
  stack?: string;
  code?: string | number;
  raw?: unknown;
}

/**
 * Standardizes an unknown error into a structured object suitable for JSON serialization and logging.
 * Replaces duplicated 3-line error serialization pattern across the repo per MAJ-022.
 *
 * @param err - Unknown error object, string, or primitive
 * @returns Structured SerializedError representation
 */
export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    const serialized: SerializedError = {
      name: err.name,
      message: err.message,
    };
    if (err.stack) {
      serialized.stack = err.stack;
    }
    if ("code" in err && (typeof err.code === "string" || typeof err.code === "number")) {
      serialized.code = err.code;
    }
    return serialized;
  }

  if (typeof err === "string") {
    return {
      message: err,
      raw: err,
    };
  }

  if (typeof err === "object" && err !== null) {
    const candidate = err as Record<string, unknown>;
    let message: string;
    if (typeof candidate.message === "string") {
      message = candidate.message;
    } else if (typeof candidate.error === "string") {
      message = candidate.error;
    } else {
      try {
        message = JSON.stringify(err);
      } catch {
        message = String(err);
      }
    }

    const result: SerializedError = {
      message,
      raw: err,
    };
    if ("code" in candidate && (typeof candidate.code === "string" || typeof candidate.code === "number")) {
      result.code = candidate.code;
    }
    if ("name" in candidate && typeof candidate.name === "string") {
      result.name = candidate.name;
    }
    return result;
  }

  return {
    message: String(err),
    raw: err,
  };
}

/**
 * Extracts a human-readable error message string from an unknown error instance.
 *
 * @param err - Unknown error instance
 * @param fallback - Default message returned when no message can be resolved
 * @returns Non-empty error message string
 */
export function toErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred",
): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "string" && err.trim().length > 0) {
    return err.trim();
  }
  if (typeof err === "object" && err !== null) {
    const candidate = err as Record<string, unknown>;
    if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
      return candidate.message.trim();
    }
    if (typeof candidate.error === "string" && candidate.error.trim().length > 0) {
      return candidate.error.trim();
    }
  }
  return fallback;
}
