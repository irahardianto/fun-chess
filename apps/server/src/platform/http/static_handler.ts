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
export function checkPathTraversal(
  rootDir: string,
  urlPath: string,
  logger?: Logger,
  clientIp?: string,
): boolean {
  if (urlPath.includes("\0") || urlPath.toLowerCase().includes("%00")) {
    return true;
  }

  const lowerUrl = urlPath.toLowerCase();
  let decodedPath: string;
  try {
    let decoded = decodeURIComponent(urlPath);
    try {
      decoded = decodeURIComponent(decoded);
    } catch (secErr) {
      logger?.warn("Malformed URI component in secondary decode", {
        operation: "static_serve_decode_error",
        path: urlPath,
        clientIp,
        error: secErr instanceof Error ? secErr.message : String(secErr),
      });
    }
    decodedPath = decoded;
  } catch (err) {
    logger?.warn("Malformed URI component in static path request", {
      operation: "static_serve_decode_error",
      path: urlPath,
      clientIp,
      error: err instanceof Error ? err.message : String(err),
    });
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
  logger?: Logger,
  clientIp?: string,
): { sanitizedPath: string; targetFilePath: string; isTraversal: boolean } {
  const isTraversal = checkPathTraversal(rootDir, urlPath, logger, clientIp);
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

function handleForbidden(
  res: ServerResponse,
  isHead: boolean,
  message = "Forbidden",
): boolean {
  res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
  if (isHead) {
    res.end();
  } else {
    res.end(message);
  }
  return true;
}

function handleServerError(
  res: ServerResponse,
  isHead: boolean,
  message = "Internal Server Error",
): boolean {
  if (!res.headersSent) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    if (isHead) {
      res.end();
    } else {
      res.end(message);
    }
  }
  return true;
}

function handleNotFound(
  res: ServerResponse,
  isHead: boolean,
  message = "Not Found",
  correlationId?: string,
): boolean {
  const errorEnvelope = {
    status: "error",
    code: 404,
    error: {
      code: "ERR_NOT_FOUND",
      message,
      ...(correlationId ? { correlationId } : {}),
    },
  };
  const body = JSON.stringify(errorEnvelope);
  res.writeHead(404, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  if (isHead) {
    res.end();
  } else {
    res.end(body);
  }
  return true;
}

type TargetResolution =
  | { status: "ready"; targetFilePath: string }
  | { status: "not_found" }
  | { status: "error"; error: unknown };

async function resolveTargetFile(
  fileStorage: IFileStorage,
  initialTarget: string,
  rootDir: string,
  sanitizedPath: string,
  acceptHeader: string,
): Promise<TargetResolution> {
  let targetFilePath = initialTarget;
  const ext = path.extname(sanitizedPath).toLowerCase();

  try {
    const fileStat = await fileStorage.stat(targetFilePath);
    if (fileStat.isDirectory) {
      targetFilePath = path.join(targetFilePath, "index.html");
      await fileStorage.stat(targetFilePath);
    }
    return { status: "ready", targetFilePath };
  } catch (err: unknown) {
    const errCode = (err as { code?: string })?.code;
    if (errCode && errCode !== "ENOENT") {
      return { status: "error", error: err };
    }

    if (ext) {
      return { status: "not_found" };
    }

    if (
      acceptHeader.includes("text/html") ||
      acceptHeader.includes("*/*") ||
      !acceptHeader
    ) {
      return {
        status: "ready",
        targetFilePath: path.join(rootDir, "index.html"),
      };
    }

    return { status: "not_found" };
  }
}

type CanonicalPathResult =
  | { status: "ok" }
  | { status: "traversal"; canonicalTarget: string }
  | { status: "error"; error: unknown };

async function verifyCanonicalPath(
  fileStorage: IFileStorage,
  rootDir: string,
  targetFilePath: string,
): Promise<CanonicalPathResult> {
  if (!fileStorage.realpath) {
    return { status: "ok" };
  }

  try {
    const canonicalRoot = await fileStorage.realpath(rootDir);
    const canonicalTarget = await fileStorage.realpath(targetFilePath);
    const isInsideRoot =
      canonicalTarget === canonicalRoot ||
      canonicalTarget.startsWith(
        canonicalRoot.endsWith(path.sep)
          ? canonicalRoot
          : canonicalRoot + path.sep,
      );

    if (!isInsideRoot) {
      return { status: "traversal", canonicalTarget };
    }
    return { status: "ok" };
  } catch (err: unknown) {
    const errCode = (err as { code?: string })?.code;
    if (errCode && errCode !== "ENOENT") {
      return { status: "error", error: err };
    }
    return { status: "ok" };
  }
}

function sendFallbackOrMiss(
  res: ServerResponse,
  options: StaticFileHandlerOptions,
  context: {
    urlPath: string;
    isHead: boolean;
    correlationId?: string;
    acceptHeader: string;
  },
  targetFilePath: string,
  readError: unknown,
  logger?: Logger,
): boolean {
  const { urlPath, isHead, correlationId, acceptHeader } = context;
  const ext = path.extname(urlPath).toLowerCase();

  if (
    options.fallbackHtml &&
    !ext &&
    (acceptHeader.includes("text/html") ||
      acceptHeader.includes("*/*") ||
      !acceptHeader)
  ) {
    try {
      sendAssetResponse(
        res,
        options.fallbackHtml,
        "text/html; charset=utf-8",
        true,
        isHead,
      );
      return true;
    } catch (fallbackErr: unknown) {
      logger?.error("Failed to send fallback HTML response", {
        operation: "http_request",
        correlationId,
        path: urlPath,
        error:
          fallbackErr instanceof Error
            ? { name: fallbackErr.name, message: fallbackErr.message }
            : { raw: fallbackErr },
      });
      return handleServerError(res, isHead);
    }
  }

  logger?.debug("Static file not found and no fallback provided", {
    operation: "http_request",
    targetFilePath,
    correlationId,
    error: readError instanceof Error ? readError.message : String(readError),
  });

  return false;
}

async function readAndSendStaticFile(
  res: ServerResponse,
  fileStorage: IFileStorage,
  targetFilePath: string,
  options: StaticFileHandlerOptions,
  context: {
    urlPath: string;
    isHead: boolean;
    correlationId?: string;
    acceptHeader: string;
  },
  logger?: Logger,
): Promise<boolean> {
  const { urlPath, isHead, correlationId } = context;

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
        operation: "http_request",
        correlationId,
        path: urlPath,
        error:
          sendErr instanceof Error
            ? {
                name: sendErr.name,
                message: sendErr.message,
                stack: sendErr.stack,
              }
            : { raw: sendErr },
      });
      return handleServerError(res, isHead);
    }
  } catch (err: unknown) {
    const errCode = (err as { code?: string })?.code;
    if (errCode && errCode !== "ENOENT") {
      logger?.error("Failed to read static file", {
        operation: "http_request",
        correlationId,
        path: urlPath,
        targetFilePath,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
      return handleServerError(res, isHead);
    }

    return sendFallbackOrMiss(
      res,
      options,
      context,
      targetFilePath,
      err,
      logger,
    );
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
  const startTime = performance.now();
  const fileStorage = options.fileStorage ?? new NodeFileStorage();
  const isHead = req.method?.toUpperCase() === "HEAD";
  const urlPath = req.url?.split("?")[0] || "/";
  const rootDir = path.resolve(options.distPath);
  const clientIp = extractClientIp(
    req,
    options.trustProxy ??
      (!req.socket && Boolean(req.headers?.["x-forwarded-for"])),
  );
  const correlationId = options.correlationId;

  // 1. Path Traversal Guard (SEC-HIGH-002, CRIT-008, MAJ-034)
  const {
    sanitizedPath,
    targetFilePath: initialTarget,
    isTraversal,
  } = resolveCandidatePath(rootDir, urlPath, logger, clientIp);

  if (isTraversal) {
    const duration = Math.round(performance.now() - startTime);
    logger?.warn("Directory traversal attempt detected", {
      operation: "security_violation",
      correlationId,
      path: urlPath,
      clientIp,
      duration,
      durationMs: duration,
    });
    return handleForbidden(res, isHead);
  }

  const acceptHeader = (req.headers?.["accept"] as string) || "";

  // 2. Stat File or Directory
  const statResult = await resolveTargetFile(
    fileStorage,
    initialTarget,
    rootDir,
    sanitizedPath,
    acceptHeader,
  );

  if (statResult.status === "error") {
    logger?.error("Failed to stat static file", {
      operation: "http_request",
      correlationId,
      path: urlPath,
      targetFilePath: initialTarget,
      error:
        statResult.error instanceof Error
          ? {
              name: statResult.error.name,
              message: statResult.error.message,
              stack: statResult.error.stack,
            }
          : { raw: statResult.error },
    });
    return handleServerError(res, isHead);
  }

  if (statResult.status === "not_found") {
    return handleNotFound(res, isHead, "Not Found", correlationId);
  }

  const targetFilePath = statResult.targetFilePath;

  // 3. Symlink Canonicalization Guard (MAJ-001, CWE-59)
  const canonicalResult = await verifyCanonicalPath(
    fileStorage,
    rootDir,
    targetFilePath,
  );

  if (canonicalResult.status === "traversal") {
    const duration = Math.round(performance.now() - startTime);
    logger?.warn("Symlink directory traversal detected", {
      operation: "security_violation",
      correlationId,
      path: urlPath,
      targetFilePath,
      canonicalTarget: canonicalResult.canonicalTarget,
      clientIp,
      duration,
      durationMs: duration,
    });
    return handleForbidden(res, isHead);
  }

  if (canonicalResult.status === "error") {
    logger?.error("Failed to resolve canonical path for static file", {
      operation: "http_request",
      correlationId,
      path: urlPath,
      targetFilePath,
      error:
        canonicalResult.error instanceof Error
          ? {
              name: canonicalResult.error.name,
              message: canonicalResult.error.message,
              stack: canonicalResult.error.stack,
            }
          : { raw: canonicalResult.error },
    });
    return handleServerError(res, isHead);
  }

  // 4. Read and Send File Content
  return readAndSendStaticFile(
    res,
    fileStorage,
    targetFilePath,
    options,
    { urlPath, isHead, correlationId, acceptHeader },
    logger,
  );
}
