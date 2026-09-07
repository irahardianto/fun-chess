import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Logger } from "../logger/logger.interface.js";
import { IFileStorage, NodeFileStorage } from "./file_storage.js";

const MIME_TYPES: Record<string, string> = {
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
}

/**
 * Handles static asset serving and SPA HTML5 history mode fallback.
 * Uses injected IFileStorage abstraction (MAJ-016).
 * Inspects error codes and returns 500 on non-ENOENT system errors (MAJ-014).
 * Hardened against directory traversal (CRIT-008) and 200 asset masking.
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

  const forwarded =
    options.trustProxy === false ? undefined : req.headers?.["x-forwarded-for"];
  const clientIp =
    (typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]?.trim()
        : undefined) ||
    req.socket?.remoteAddress ||
    "127.0.0.1";

  // Pre-normalization Directory Traversal Inspection (SEC-HIGH-002, CRIT-008)
  const lowerUrl = urlPath.toLowerCase();
  let decodedPath = "";
  try {
    decodedPath = decodeURIComponent(urlPath);
    try {
      decodedPath = decodeURIComponent(decodedPath);
    } catch {
      // ignore secondary decoding failure
    }
  } catch {
    decodedPath = urlPath;
  }

  const normalizedPrefix = urlPath.startsWith("/") ? urlPath : "/" + urlPath;
  const resolvedCandidate = path.resolve(rootDir, "." + normalizedPrefix);
  const relativeCandidate = path.relative(rootDir, resolvedCandidate);
  const escapesRoot =
    relativeCandidate.startsWith("..") || path.isAbsolute(relativeCandidate);

  const isTraversal =
    urlPath.includes("..") ||
    lowerUrl.includes("%2e%2e") ||
    decodedPath.includes("..") ||
    escapesRoot;

  if (isTraversal) {
    logger?.warn("Directory traversal attempt detected", {
      operation: "security_violation",
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

  const sanitizedPath = path.normalize(urlPath);

  // Target candidate path
  let targetFilePath = path.join(rootDir, sanitizedPath === "/" ? "index.html" : sanitizedPath);
  const relative = path.relative(rootDir, targetFilePath);

  // Redundant defense-in-depth: target must reside inside rootDir (CRIT-008)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    logger?.warn("Directory traversal attempt detected", {
      operation: "security_violation",
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

  const ext = path.extname(sanitizedPath).toLowerCase();
  const acceptHeader = (req.headers?.["accept"] as string) || "";

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
        operation: "static_file_stat_error",
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

    // 2. Missing asset handling (CRIT-008):
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

    // 3. SPA History Mode Fallback: Only rewrite to index.html if caller accepts HTML navigation
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

  try {
    const content = await fileStorage.readFile(targetFilePath);
    const resolvedExt = path.extname(targetFilePath).toLowerCase();
    const contentType = MIME_TYPES[resolvedExt] || "application/octet-stream";

    // Cache immutable hashed assets, don't cache index.html
    const isIndex = targetFilePath.endsWith("index.html");
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
    return true;
  } catch (err: unknown) {
    const errCode = (err as { code?: string })?.code;
    if (errCode && errCode !== "ENOENT") {
      logger?.error("Failed to read static file", {
        operation: "static_file_read_error",
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

    // Fallback HTML if disk assets (index.html) don't exist in dev/container preview
    if (
      options.fallbackHtml &&
      !ext &&
      (acceptHeader.includes("text/html") || acceptHeader.includes("*/*") || !acceptHeader)
    ) {
      const fbLength = Buffer.byteLength(options.fallbackHtml);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": fbLength,
        "Cache-Control": "no-cache",
      });
      if (isHead) {
        res.end();
      } else {
        res.end(options.fallbackHtml);
      }
      return true;
    }

    logger?.debug("Static file not found and no fallback provided", {
      targetFilePath,
      error: err instanceof Error ? err.message : String(err),
    });

    return false;
  }
}
