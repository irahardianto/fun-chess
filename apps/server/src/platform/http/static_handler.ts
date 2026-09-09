import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Logger } from "../logger/logger.interface.js";
import { IFileStorage, NodeFileStorage } from "./file_storage.js";
import { extractClientIp } from "./ip_utils.js";

export const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

export interface StaticFileHandlerOptions {
  distPath: string;
  fallbackHtml?: string;
  fileStorage?: IFileStorage;
  trustProxy?: boolean;
  correlationId?: string;
}

// --- Decomposed Helper Functions (MIN-022) ---

export { extractClientIp };

/**
 * Checks for path traversal sequences, URL encoding bypasses (%2e%2e),
 * null byte injections (%00, \0), and directory escape boundaries (CRIT-008, MAJ-034).
 */
export function checkPathTraversal(rootDir: string, urlPath: string): boolean {
  if (urlPath.includes("\0") || urlPath.toLowerCase().includes("%00")) {
    return true;
  }

  const lowerUrl = urlPath.toLowerCase();
  let decodedPath: string;
  try {
    let decoded = decodeURIComponent(urlPath);
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // Ignore secondary decoding failure
    }
    decodedPath = decoded;
  } catch {
    decodedPath = urlPath;
  }

  if (decodedPath.includes("\0")) {
    return true;
  }

  const normalizedPrefix = urlPath.startsWith("/") ? urlPath : "/" + urlPath;
  const resolvedCandidate = path.resolve(rootDir, "." + normalizedPrefix);
  const relativeCandidate = path.relative(rootDir, resolvedCandidate);
  const escapesRoot =
    relativeCandidate.startsWith("..") || path.isAbsolute(relativeCandidate);

  return (
    urlPath.includes("..") ||
    lowerUrl.includes("%2e%2e") ||
    decodedPath.includes("..") ||
    escapesRoot
  );
}

/**
 * Resolves candidate file path on disk, ensuring it cannot escape root directory.
 */
export function resolveCandidatePath(
  rootDir: string,
  urlPath: string,
): { sanitizedPath: string; targetFilePath: string; isTraversal: boolean } {
  const isTraversal = checkPathTraversal(rootDir, urlPath);
  const sanitizedPath = path.normalize(urlPath);
  const targetFilePath = path.join(
    rootDir,
    sanitizedPath === "/" ? "index.html" : sanitizedPath,
  );
  const relative = path.relative(rootDir, targetFilePath);
  const escapesRoot = relative.startsWith("..") || path.isAbsolute(relative);

  return {
    sanitizedPath,
    targetFilePath,
    isTraversal: isTraversal || escapesRoot,
  };
}

/**
 * Sends static asset HTTP response with appropriate caching and MIME headers.
 */
export function sendAssetResponse(
  res: ServerResponse,
  content: Buffer | string,
  contentType: string,
  isIndex: boolean,
  isHead: boolean,
): void {
  const cacheControl = isIndex
    ? "no-cache"
    : "public, max-age=31536000, immutable";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(content),
    "Cache-Control": cacheControl,
  });

  if (isHead) {
    res.end();
  } else {
    res.end(content);
  }
}

/**
 * Handles static asset serving and SPA HTML5 history mode fallback.
 * Uses injected IFileStorage abstraction (MAJ-016).
 * Inspects error codes and returns 500 on non-ENOENT system errors (MAJ-014).
 * Hardened against directory traversal (CRIT-008, MAJ-034) and 200 asset masking.
 * Decomposed into focused helpers (MIN-022).
 */
export async function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  options: StaticFileHandlerOptions,
  logger?: Logger,
): Promise<boolean> {
  const fileStorage = options.fileStorage ?? new NodeFileStorage();
  const isHead = req.method?.toUpperCase() === "HEAD";
  const urlPath = req.url?.split("?")[0] || "/";
  const rootDir = path.resolve(options.distPath);
  const clientIp = extractClientIp(
    req,
    options.trustProxy ?? (!req.socket && Boolean(req.headers?.["x-forwarded-for"])),
  );
  const correlationId = options.correlationId;

  // 1. Path Traversal Guard (SEC-HIGH-002, CRIT-008, MAJ-034)
  const { sanitizedPath, targetFilePath: initialTarget, isTraversal } =
    resolveCandidatePath(rootDir, urlPath);

  if (isTraversal) {
    logger?.warn("Directory traversal attempt detected", {
      operation: "security_violation",
      correlationId,
      path: urlPath,
      clientIp,
    });

    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    if (isHead) {
      res.end();
    } else {
      res.end("Forbidden");
    }
    return true;
  }

  let targetFilePath = initialTarget;
  const ext = path.extname(sanitizedPath).toLowerCase();
  const acceptHeader = (req.headers?.["accept"] as string) || "";

  // 2. Stat File or Directory
  try {
    const fileStat = await fileStorage.stat(targetFilePath);
    if (fileStat.isDirectory) {
      targetFilePath = path.join(targetFilePath, "index.html");
      await fileStorage.stat(targetFilePath);
    }
  } catch (err: unknown) {
    const errCode = (err as { code?: string })?.code;
    if (errCode && errCode !== "ENOENT") {
      logger?.error("Failed to stat static file", {
        operation: "http_static",
        correlationId,
        path: urlPath,
        targetFilePath,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      if (isHead) {
        res.end();
      } else {
        res.end("Internal Server Error");
      }
      return true;
    }

    // Missing asset handling (CRIT-008, MAJ-034):
    // If request has a file extension (e.g. .js, .css, .png, .json), NEVER rewrite to index.html with 200!
    if (ext) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      if (isHead) {
        res.end();
      } else {
        res.end("Not Found");
      }
      return true;
    }

    // SPA History Mode Fallback: Only rewrite to index.html if caller accepts HTML navigation
    if (acceptHeader.includes("text/html") || acceptHeader.includes("*/*") || !acceptHeader) {
      targetFilePath = path.join(rootDir, "index.html");
    } else {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      if (isHead) {
        res.end();
      } else {
        res.end("Not Found");
      }
      return true;
    }
  }

  // 3. Symlink Canonicalization Guard (MAJ-001, CWE-59)
  if (fileStorage.realpath) {
    try {
      const canonicalRoot = await fileStorage.realpath(rootDir);
      const canonicalTarget = await fileStorage.realpath(targetFilePath);
      const isInsideRoot =
        canonicalTarget === canonicalRoot ||
        canonicalTarget.startsWith(
          canonicalRoot.endsWith(path.sep) ? canonicalRoot : canonicalRoot + path.sep,
        );

      if (!isInsideRoot) {
        logger?.warn("Symlink directory traversal detected", {
          operation: "security_violation",
          correlationId,
          path: urlPath,
          targetFilePath,
          canonicalTarget,
          clientIp,
        });
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        if (isHead) {
          res.end();
        } else {
          res.end("Forbidden");
        }
        return true;
      }
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code;
      if (errCode && errCode !== "ENOENT") {
        logger?.error("Failed to resolve canonical path for static file", {
          operation: "http_static",
          correlationId,
          path: urlPath,
          targetFilePath,
          error:
            err instanceof Error
              ? { name: err.name, message: err.message, stack: err.stack }
              : { raw: err },
        });
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        if (isHead) {
          res.end();
        } else {
          res.end("Internal Server Error");
        }
        return true;
      }
    }
  }

  // 4. Read and Send File Content
  try {
    const content = await fileStorage.readFile(targetFilePath);
    const resolvedExt = path.extname(targetFilePath).toLowerCase();
    const contentType = MIME_TYPES[resolvedExt] || "application/octet-stream";
    const isIndex = targetFilePath.endsWith("index.html");

    try {
      sendAssetResponse(res, content, contentType, isIndex, isHead);
      return true;
    } catch (sendErr: unknown) {
      logger?.error("Failed to send static asset response", {
        operation: "http_static",
        correlationId,
        path: urlPath,
        error:
          sendErr instanceof Error
            ? { name: sendErr.name, message: sendErr.message, stack: sendErr.stack }
            : { raw: sendErr },
      });
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Internal Server Error");
      }
      return true;
    }
  } catch (err: unknown) {
    const errCode = (err as { code?: string })?.code;
    if (errCode && errCode !== "ENOENT") {
      logger?.error("Failed to read static file", {
        operation: "http_static",
        correlationId,
        path: urlPath,
        targetFilePath,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        if (isHead) {
          res.end();
        } else {
          res.end("Internal Server Error");
        }
      }
      return true;
    }

    // Fallback HTML if disk assets (index.html) don't exist in dev/container preview
    if (
      options.fallbackHtml &&
      !ext &&
      (acceptHeader.includes("text/html") || acceptHeader.includes("*/*") || !acceptHeader)
    ) {
      try {
        sendAssetResponse(res, options.fallbackHtml, "text/html; charset=utf-8", true, isHead);
        return true;
      } catch (fallbackErr: unknown) {
        logger?.error("Failed to send fallback HTML response", {
          operation: "http_static",
          correlationId,
          path: urlPath,
          error:
            fallbackErr instanceof Error
              ? { name: fallbackErr.name, message: fallbackErr.message }
              : { raw: fallbackErr },
        });
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Internal Server Error");
        }
        return true;
      }
    }

    logger?.debug("Static file not found and no fallback provided", {
      operation: "http_static",
      targetFilePath,
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    });

    return false;
  }
}
