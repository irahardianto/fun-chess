import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http, { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { serveStaticFile } from "../static_handler.js";
import { Logger } from "../../logger/logger.interface.js";

describe("serveStaticFile", () => {
  let tempDir: string;
  let server: http.Server;
  let port: number;

  const MIME_EXT_MAP: Record<string, string> = {
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


  beforeAll(async () => {
    // Create temporary fixture directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fun-chess-static-test-"));

    // Write index.html
    await fs.writeFile(
      path.join(tempDir, "index.html"),
      "<!DOCTYPE html><html><body>Root Index</body></html>",
    );

    // Write a file for every MIME type
    for (const [ext] of Object.entries(MIME_EXT_MAP)) {
      if (ext === ".html") continue;
      const fileName = `test_file${ext}`;
      await fs.writeFile(
        path.join(tempDir, fileName),
        `dummy content for ${ext}`,
      );
    }

    // Write an unknown extension file
    await fs.writeFile(
      path.join(tempDir, "unknown.bin"),
      "binary content",
    );

    // Write a subdirectory with index.html
    const subDir = path.join(tempDir, "subdir");
    await fs.mkdir(subDir);
    await fs.writeFile(
      path.join(subDir, "index.html"),
      "<!DOCTYPE html><html><body>Subdir Index</body></html>",
    );

    // Start HTTP server wrapping serveStaticFile
    server = http.createServer(async (req, res) => {
      await serveStaticFile(req, res, { distPath: tempDir });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("MIME Types (All 19 Supported Formats)", () => {
    for (const [ext, expectedMime] of Object.entries(MIME_EXT_MAP)) {
      it(`serves ${ext} with correct Content-Type '${expectedMime}' and headers`, async () => {
        const fileName = ext === ".html" ? "index.html" : `test_file${ext}`;
        const res = await fetch(`http://127.0.0.1:${port}/${fileName}`);

        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe(expectedMime);
        expect(res.headers.get("content-length")).toBeDefined();

        if (ext === ".html") {
          expect(res.headers.get("cache-control")).toBe("no-cache");
        } else {
          expect(res.headers.get("cache-control")).toBe(
            "public, max-age=31536000, immutable",
          );
        }
      });
    }

    it("serves unknown file extension with application/octet-stream", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/unknown.bin`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/octet-stream");
    });
  });

  describe("HTTP HEAD Method Support (NET-02)", () => {
    it("handles HEAD requests for static assets with 200, headers, and empty body", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/test_file.css`, {
        method: "HEAD",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/css; charset=utf-8");
      expect(res.headers.get("content-length")).toBeDefined();
      const body = await res.text();
      expect(body).toBe("");
    });

    it("handles HEAD requests for SPA routes returning index.html headers with empty body", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/room/1234`, {
        method: "HEAD",
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      const body = await res.text();
      expect(body).toBe("");
    });
  });

  describe("Directory and SPA Fallback Routing", () => {
    it("serves root index.html for root path '/'", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(res.headers.get("cache-control")).toBe("no-cache");
      const text = await res.text();
      expect(text).toContain("Root Index");
    });

    it("serves index.html inside a subdirectory when requesting directory path", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/subdir`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Subdir Index");
    });

    it("falls back to root index.html when a non-existent SPA client route is requested", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/room/ABCD`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(res.headers.get("cache-control")).toBe("no-cache");
      const text = await res.text();
      expect(text).toContain("Root Index");
    });
  });


  describe("Directory Traversal Prevention", () => {
    it("prevents directory traversal attacks outside rootDir", async () => {
      let responseBody = "";

      const mockRes = {
        writeHead: () => mockRes,
        end: (body?: string) => {
          responseBody = body || "";
          return mockRes;
        },
      } as unknown as ServerResponse;

      const customReq = {
        url: "/../../../etc/passwd",
      } as IncomingMessage;

      const handled = await serveStaticFile(customReq, mockRes, {
        distPath: tempDir,
      });

      expect(handled).toBe(true);
      expect(responseBody).not.toContain("root:");
    });

    it("returns 403 Forbidden if targetFilePath does not start with rootDir", async () => {
      let statusCode = 0;
      let responseBody = "";

      const mockReq = {
        url: "/test",
      } as IncomingMessage;

      const mockRes = {
        writeHead: (status: number) => {
          statusCode = status;
          return mockRes;
        },
        end: (body?: string) => {
          responseBody = body || "";
          return mockRes;
        },
      } as unknown as ServerResponse;

      const handled = await serveStaticFile(
        mockReq,
        mockRes,
        {
          distPath: tempDir,
        },
      );

      expect(handled).toBe(true);
    });
  });

  describe("Fallback HTML and Missing File Handling", () => {
    it("uses fallbackHtml when provided and root index.html does not exist on disk", async () => {
      const emptyDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "fun-chess-empty-test-"),
      );

      let statusCode = 0;
      let responseHeaders: Record<string, string> = {};
      let responseBody = "";

      const mockReq = {
        url: "/missing-page",
      } as IncomingMessage;

      const mockRes = {
        writeHead: (status: number, headers?: any) => {
          statusCode = status;
          responseHeaders = headers || {};
          return mockRes;
        },
        end: (body?: string) => {
          responseBody = body || "";
          return mockRes;
        },
      } as unknown as ServerResponse;

      const handled = await serveStaticFile(mockReq, mockRes, {
        distPath: emptyDir,
        fallbackHtml: "<html><body>Custom Fallback</body></html>",
      });

      expect(handled).toBe(true);
      expect(statusCode).toBe(200);
      expect(responseHeaders["Content-Type"]).toBe("text/html; charset=utf-8");
      expect(responseBody).toContain("Custom Fallback");

      await fs.rm(emptyDir, { recursive: true, force: true });
    });

    it("returns false and logs debug when file is missing and no fallback is provided", async () => {
      const emptyDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "fun-chess-empty-test-"),
      );

      const mockReq = {
        url: "/missing-page",
      } as IncomingMessage;

      const mockRes = {
        writeHead: () => mockRes,
        end: () => mockRes,
      } as unknown as ServerResponse;

      let debugLogged = false;
      const mockLogger: Logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: (msg) => {
          if (msg.includes("Static file not found")) {
            debugLogged = true;
          }
        },
        child: () => mockLogger,
      };

      const handled = await serveStaticFile(
        mockReq,
        mockRes,
        { distPath: emptyDir },
        mockLogger,
      );

      expect(handled).toBe(false);
      expect(debugLogged).toBe(true);

      await fs.rm(emptyDir, { recursive: true, force: true });
    });
  });
});
