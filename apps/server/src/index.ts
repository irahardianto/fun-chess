import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { serializeError } from "@fun-chess/shared";
import { PinoLogger } from "./platform/logger/index.js";
import {
  startServer,
  parseFallbackLogLevel,
} from "./bootstrap/index.js";

export * from "./bootstrap/index.js";

// Auto-start if executed directly via node or CLI (MAJ-027)
const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]!);

if (isMain) {
  startServer().catch((err) => {
    const bootstrapCorrelationId = randomUUID();
    const safeLogLevel = parseFallbackLogLevel(process.env.LOG_LEVEL);
    const fallbackLogger = new PinoLogger({
      level: safeLogLevel,
    });
    fallbackLogger.fatal("Fatal bootstrap error during server startup", {
      operation: "server_bootstrap_fatal",
      correlationId: bootstrapCorrelationId,
      error: serializeError(err),
    });
    process.exit(1);
  });
}
