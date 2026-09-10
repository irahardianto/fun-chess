import { describe, it, expect } from "vitest";
import { serializeError, toErrorMessage } from "../error_utils.js";

describe("Error Serialization Utilities (MAJ-022)", () => {
  describe("serializeError", () => {
    it("serializes standard Error instances with name, message, and stack", () => {
      const err = new Error("Database connection timed out");
      const serialized = serializeError(err);

      expect(serialized.name).toBe("Error");
      expect(serialized.message).toBe("Database connection timed out");
      expect(serialized.stack).toBeDefined();
      expect(serialized.stack).toContain("Database connection timed out");
      expect(serialized.code).toBeUndefined();
    });

    it("serializes custom errors preserving code property", () => {
      interface CodedError extends Error {
        code?: string | number;
      }
      const err = new Error("Room not found") as CodedError;
      err.name = "RoomNotFoundError";
      err.code = "ERR_ROOM_NOT_FOUND";

      const serialized = serializeError(err);
      expect(serialized.name).toBe("RoomNotFoundError");
      expect(serialized.message).toBe("Room not found");
      expect(serialized.code).toBe("ERR_ROOM_NOT_FOUND");
    });

    it("serializes plain string errors", () => {
      const serialized = serializeError("network disconnect");

      expect(serialized.message).toBe("network disconnect");
      expect(serialized.raw).toBe("network disconnect");
      expect(serialized.name).toBeUndefined();
    });

    it("serializes object errors with message property", () => {
      const serialized = serializeError({
        message: "Failed to parse move payload",
        code: 400,
        extra: "data",
      });

      expect(serialized.message).toBe("Failed to parse move payload");
      expect(serialized.code).toBe(400);
      expect(serialized.raw).toEqual({
        message: "Failed to parse move payload",
        code: 400,
        extra: "data",
      });
    });

    it("serializes object errors with error property", () => {
      const serialized = serializeError({
        error: "Rate limit exceeded",
      });

      expect(serialized.message).toBe("Rate limit exceeded");
    });

    it("handles objects without message or error property", () => {
      const payload = { status: "failed", code: 500 };
      const serialized = serializeError(payload);

      expect(serialized.message).toBe(JSON.stringify(payload));
      expect(serialized.code).toBe(500);
    });

    it("handles circular objects gracefully without throwing", () => {
      const circular: Record<string, unknown> = { note: "broken" };
      circular.self = circular;

      expect(() => serializeError(circular)).not.toThrow();
      const serialized = serializeError(circular);
      expect(serialized.message).toBeDefined();
    });

    it("serializes primitive types like numbers and booleans", () => {
      expect(serializeError(404)).toEqual({ message: "404", raw: 404 });
      expect(serializeError(false)).toEqual({ message: "false", raw: false });
      expect(serializeError(null)).toEqual({ message: "null", raw: null });
      expect(serializeError(undefined)).toEqual({ message: "undefined", raw: undefined });
    });
  });

  describe("toErrorMessage", () => {
    it("extracts message from Error instance", () => {
      const err = new Error("Invalid move: piece pinned");
      expect(toErrorMessage(err)).toBe("Invalid move: piece pinned");
    });

    it("extracts and trims string errors", () => {
      expect(toErrorMessage("  Something went wrong  ")).toBe("Something went wrong");
    });

    it("extracts message from object with message property", () => {
      expect(toErrorMessage({ message: "  Room full  " })).toBe("Room full");
    });

    it("extracts error string from object with error property", () => {
      expect(toErrorMessage({ error: "Access denied" })).toBe("Access denied");
    });

    it("returns custom fallback when error is empty or cannot be resolved", () => {
      expect(toErrorMessage("", "Custom fallback")).toBe("Custom fallback");
      expect(toErrorMessage("   ", "Custom fallback")).toBe("Custom fallback");
      expect(toErrorMessage({}, "Custom fallback")).toBe("Custom fallback");
      expect(toErrorMessage(null, "Custom fallback")).toBe("Custom fallback");
      expect(toErrorMessage(undefined, "Custom fallback")).toBe("Custom fallback");
      expect(toErrorMessage(123, "Custom fallback")).toBe("Custom fallback");
    });

    it("returns default fallback when no custom fallback is provided", () => {
      expect(toErrorMessage(null)).toBe("An unexpected error occurred");
    });
  });
});
