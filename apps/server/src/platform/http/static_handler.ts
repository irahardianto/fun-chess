import { IncomingMessage, ServerResponse } from "node:http";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import { Logger } from "../logger/logger.interface.js";

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
}

/**
 * Handles static asset serving and SPA HTML5 history mode fallback.
 */
export async function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  options: StaticFileHandlerOptions,
  logger?: Logger,
): Promise<boolean> {
  const isHead = req.method?.toUpperCase() === "HEAD";
  const urlPath = req.url?.split("?")[0] || "/";
  const sanitizedPath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const rootDir = path.resolve(options.distPath);

  // Target candidate path
  let targetFilePath = path.join(rootDir, sanitizedPath);

  // Prevent directory traversal outside rootDir
  if (!targetFilePath.startsWith(rootDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    if (isHead) {
      res.end();
    } else {
      res.end("Forbidden");
    }
    return true;
  }

  try {
    const fileStat = await stat(targetFilePath);
    if (fileStat.isDirectory()) {
      targetFilePath = path.join(targetFilePath, "index.html");
      await stat(targetFilePath);
    }
  } catch {
    // If specific file not found, fall back to root index.html for SPA client routing
    targetFilePath = path.join(rootDir, "index.html");
  }

  try {
    const content = await readFile(targetFilePath);
    const ext = path.extname(targetFilePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

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
  } catch (err) {
    if (options.fallbackHtml) {
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
      error: (err as Error).message,
    });
    return false;
  }
}

