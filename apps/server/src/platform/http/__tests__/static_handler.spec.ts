import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http, { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { serveStaticFile, checkPathTraversal } from "../static_handler.js";
import { Logger } from "../../logger/logger.interface.js";
import { defaultLogger } from "../../logger/index.js";
import { NullLogger } from "../../logger/null_logger.js";

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


  describe("Directory Traversal Prevention (SEC-HIGH-002, CRIT-008)", () => {
    it("prevents directory traversal attacks outside rootDir and returns 403 Forbidden", async () => {
      let statusCode = 0;
      let responseBody = "";

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

      const customReq = {
        url: "/../../../etc/passwd",
        headers: {},
        socket: { remoteAddress: "192.168.1.100" },
      } as unknown as IncomingMessage;

      const loggedWarnings: { msg: string; meta?: Record<string, unknown> }[] = [];
      const mockLogger = {
        info: () => {},
        warn: (msg: string, meta?: Record<string, unknown>) => {
          loggedWarnings.push({ msg, meta });
        },
        error: () => {},
        debug: () => {},
        child: () => mockLogger,
      } as unknown as Logger;

      const handled = await serveStaticFile(
        customReq,
        mockRes,
        { distPath: tempDir },
        mockLogger,
      );

      expect(handled).toBe(true);
      expect(statusCode).toBe(403);
      expect(responseBody).toBe("Forbidden");
      expect(loggedWarnings).toHaveLength(1);
      expect(loggedWarnings[0]?.msg).toBe("Directory traversal attempt detected");
      expect(loggedWarnings[0]?.meta).toMatchObject({
        operation: "security_violation",
        path: "/../../../etc/passwd",
        clientIp: "192.168.1.100",
      });
      expect(typeof loggedWarnings[0]?.meta?.["duration"]).toBe("number");
      expect(typeof loggedWarnings[0]?.meta?.["durationMs"]).toBe("number");
    });

    it("detects /.. and /../ returning 403 rather than masking with 200 index.html", async () => {
      for (const traversalUrl of ["/..", "/../", "/subdir/..", "/subdir/../../etc"]) {
        let statusCode = 0;
        let responseBody = "";

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

        const customReq = {
          url: traversalUrl,
          headers: { "x-forwarded-for": "10.0.0.5" },
        } as unknown as IncomingMessage;

        let warned = false;
        const mockLogger = {
          info: () => {},
          warn: (_msg: string, meta?: Record<string, unknown>) => {
            if (meta?.["operation"] === "security_violation") warned = true;
          },
          error: () => {},
          debug: () => {},
          child: () => mockLogger,
        } as unknown as Logger;

        const handled = await serveStaticFile(
          customReq,
          mockRes,
          { distPath: tempDir },
          mockLogger,
        );

        expect(handled).toBe(true);
        expect(statusCode).toBe(403);
        expect(responseBody).toBe("Forbidden");
        expect(warned).toBe(true);
      }
    });

    it("detects URL encoded traversal patterns (%2e%2e) returning 403 with audit log", async () => {
      let statusCode = 0;
      let responseBody = "";

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

      const customReq = {
        url: "/%2e%2e/%2e%2e/etc/passwd",
        headers: { "x-forwarded-for": "172.16.0.22" },
      } as unknown as IncomingMessage;

      const loggedWarnings: { msg: string; meta?: Record<string, unknown> }[] = [];
      const mockLogger = {
        info: () => {},
        warn: (msg: string, meta?: Record<string, unknown>) => loggedWarnings.push({ msg, meta }),
        error: () => {},
        debug: () => {},
        child: () => mockLogger,
      } as unknown as Logger;

      const handled = await serveStaticFile(
        customReq,
        mockRes,
        { distPath: tempDir },
        mockLogger,
      );

      expect(handled).toBe(true);
      expect(statusCode).toBe(403);
      expect(responseBody).toBe("Forbidden");
      expect(loggedWarnings.length).toBeGreaterThan(0);
      expect(loggedWarnings[0]?.meta?.["operation"]).toBe("security_violation");
      expect(loggedWarnings[0]?.meta?.["clientIp"]).toBe("172.16.0.22");
    });

    it("detects null byte injection (%00 and \\0) returning 403 Forbidden (MAJ-034)", async () => {
      for (const nullByteUrl of ["/%00/etc/passwd", "/assets/logo.png\0.html"]) {
        let statusCode = 0;
        let responseBody = "";

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

        const customReq = {
          url: nullByteUrl,
          headers: {},
        } as unknown as IncomingMessage;

        const handled = await serveStaticFile(customReq, mockRes, {
          distPath: tempDir,
        });

        expect(handled).toBe(true);
        expect(statusCode).toBe(403);
        expect(responseBody).toBe("Forbidden");
      }
    });

    it("extracts rightmost IP from x-forwarded-for in security violation logs (CRIT-006)", async () => {
      let loggedIp = "";

      const mockRes = {
        writeHead: () => mockRes,
        end: () => mockRes,
      } as unknown as ServerResponse;

      const customReq = {
        url: "/../secret",
        headers: {
          "x-forwarded-for": "10.0.0.1, 172.16.0.2, 198.51.100.77",
        },
      } as unknown as IncomingMessage;

      const mockLogger = {
        info: () => {},
        warn: (_msg: string, meta?: Record<string, unknown>) => {
          loggedIp = String(meta?.["clientIp"] || "");
        },
        error: () => {},
        debug: () => {},
        child: () => mockLogger,
      } as unknown as Logger;

      await serveStaticFile(
        customReq,
        mockRes,
        { distPath: tempDir, trustProxy: true },
        mockLogger,
      );

      expect(loggedIp).toBe("198.51.100.77");
    });

    it("attaches correlationId to security violation logs when provided (MAJ-016)", async () => {
      let loggedCorrId = "";

      const mockRes = {
        writeHead: () => mockRes,
        end: () => mockRes,
      } as unknown as ServerResponse;

      const customReq = {
        url: "/../secret",
        headers: {},
      } as unknown as IncomingMessage;

      const mockLogger = {
        info: () => {},
        warn: (_msg: string, meta?: Record<string, unknown>) => {
          loggedCorrId = String(meta?.["correlationId"] || "");
        },
        error: () => {},
        debug: () => {},
        child: () => mockLogger,
      } as unknown as Logger;

      await serveStaticFile(
        customReq,
        mockRes,
        { distPath: tempDir, correlationId: "static-corr-999" },
        mockLogger,
      );

      expect(loggedCorrId).toBe("static-corr-999");
    });

    it("detects symlinks pointing outside rootDir and returns 403 Forbidden (MAJ-001)", async () => {
      const outsideFile = path.join(os.tmpdir(), `fc-outside-${Date.now()}.txt`);
      await fs.writeFile(outsideFile, "secret outside content");
      const symlinkPath = path.join(tempDir, "symlink-outside.txt");
      await fs.symlink(outsideFile, symlinkPath);

      try {
        let statusCode = 0;
        let responseBody = "";

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

        const customReq = {
          url: "/symlink-outside.txt",
          headers: {},
        } as unknown as IncomingMessage;

        const handled = await serveStaticFile(customReq, mockRes, {
          distPath: tempDir,
        });

        expect(handled).toBe(true);
        expect(statusCode).toBe(403);
        expect(responseBody).toBe("Forbidden");
      } finally {
        await fs.unlink(symlinkPath).catch(() => {});
        await fs.unlink(outsideFile).catch(() => {});
      }
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
        writeHead: (status: number, headers?: Record<string, string | number | readonly string[]>) => {
          statusCode = status;
          responseHeaders = (headers as Record<string, string>) || {};
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

    it("returns 404 Not Found for missing non-HTML assets (.png, .js, .css) without returning index.html (MAJ-034)", async () => {
      for (const assetPath of ["/missing-bundle.js", "/styles/missing.css", "/icons/missing.png"]) {
        let statusCode = 0;
        let responseBody = "";

        const mockReq = {
          url: assetPath,
          headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        } as IncomingMessage;

        let responseHeaders: Record<string, string> = {};
        const mockRes = {
          writeHead: (status: number, headers?: Record<string, string | number | readonly string[]>) => {
            statusCode = status;
            responseHeaders = (headers as Record<string, string>) || {};
            return mockRes;
          },
          end: (body?: string) => {
            responseBody = body || "";
            return mockRes;
          },
        } as unknown as ServerResponse;

        const handled = await serveStaticFile(mockReq, mockRes, {
          distPath: tempDir,
        });

        expect(handled).toBe(true);
        expect(statusCode).toBe(404);
        expect(responseHeaders["Content-Type"]).toContain("application/json");
        expect(JSON.parse(responseBody)).toEqual({
          status: "error",
          code: 404,
          error: {
            code: "ERR_NOT_FOUND",
            message: "Not Found",
          },
        });
      }
    });
  });

  describe("IFileStorage & Non-ENOENT Error Handling (MAJ-014, MAJ-016)", () => {
    it("serves files and handles 404s using injected MemoryFileStorage without disk I/O", async () => {
      const { MemoryFileStorage } = await import("../file_storage.js");
      const memoryStorage = new MemoryFileStorage({
        "/virtual/dist/index.html": "<!DOCTYPE html><html>Memory Dist</html>",
        "/virtual/dist/app.js": "console.log('memory');",
      });

      let statusCode: number | undefined;
      let headers: Record<string, string | number | readonly string[]> = {};
      let body = "";

      const mockReq = {
        method: "GET",
        url: "/app.js",
        headers: {},
      } as IncomingMessage;

      const mockRes = {
        writeHead: (status: number, hdrs: Record<string, string | number | readonly string[]>) => {
          statusCode = status;
          headers = hdrs;
          return mockRes;
        },
        end: (data?: string | Uint8Array) => {
          if (data) body += data.toString();
          return mockRes;
        },
      } as unknown as ServerResponse;

      const handled = await serveStaticFile(mockReq, mockRes, {
        distPath: "/virtual/dist",
        fileStorage: memoryStorage,
      });

      expect(handled).toBe(true);
      expect(statusCode).toBe(200);
      expect(headers["Content-Type"]).toBe("application/javascript; charset=utf-8");
      expect(body).toBe("console.log('memory');");
    });

    it("returns 500 on non-ENOENT stat errors like EACCES (MAJ-014)", async () => {
      const { MemoryFileStorage } = await import("../file_storage.js");
      const memoryStorage = new MemoryFileStorage({
        "/virtual/dist/secret.txt": "sensitive",
      });

      memoryStorage.setErrorSimulator((_path, op) => {
        if (op === "stat") {
          const err = Object.assign(new Error("Permission denied"), {
            code: "EACCES",
          });
          return err;
        }
        return undefined;
      });

      let statusCode: number | undefined;
      let body = "";

      const mockReq = {
        method: "GET",
        url: "/secret.txt",
        headers: {},
      } as IncomingMessage;

      const mockRes = {
        writeHead: (status: number) => {
          statusCode = status;
          return mockRes;
        },
        end: (data?: string | Uint8Array) => {
          if (data) body += data.toString();
          return mockRes;
        },
      } as unknown as ServerResponse;

      const handled = await serveStaticFile(mockReq, mockRes, {
        distPath: "/virtual/dist",
        fileStorage: memoryStorage,
      });

      expect(handled).toBe(true);
      expect(statusCode).toBe(500);
      expect(body).toBe("Internal Server Error");
    });

    it("returns 500 on non-ENOENT readFile errors like EMFILE (MAJ-014)", async () => {
      const { MemoryFileStorage } = await import("../file_storage.js");
      const memoryStorage = new MemoryFileStorage({
        "/virtual/dist/file.txt": "content",
      });

      memoryStorage.setErrorSimulator((_path, op) => {
        if (op === "readFile") {
          const err = Object.assign(new Error("Too many open files"), {
            code: "EMFILE",
          });
          return err;
        }
        return undefined;
      });

      let statusCode: number | undefined;
      let body = "";

      const mockReq = {
        method: "GET",
        url: "/file.txt",
        headers: {},
      } as IncomingMessage;

      const mockRes = {
        writeHead: (status: number) => {
          statusCode = status;
          return mockRes;
        },
        end: (data?: string | Uint8Array) => {
          if (data) body += data.toString();
          return mockRes;
        },
      } as unknown as ServerResponse;

      const handled = await serveStaticFile(mockReq, mockRes, {
        distPath: "/virtual/dist",
        fileStorage: memoryStorage,
      });

      expect(handled).toBe(true);
      expect(statusCode).toBe(500);
      expect(body).toBe("Internal Server Error");
    });

    it("returns 500 on non-ENOENT realpath errors (MAJ-014)", async () => {
      const { MemoryFileStorage } = await import("../file_storage.js");
      const memoryStorage = new MemoryFileStorage({
        "/virtual/dist/index.html": "content",
      });

      memoryStorage.setErrorSimulator((_path, op) => {
        if (op === "realpath") {
          const err = Object.assign(new Error("EIO error"), {
            code: "EIO",
          });
          return err;
        }
        return undefined;
      });

      let statusCode: number | undefined;
      let body = "";

      const mockReq = {
        method: "GET",
        url: "/index.html",
        headers: {},
      } as IncomingMessage;

      const mockRes = {
        writeHead: (status: number) => {
          statusCode = status;
          return mockRes;
        },
        end: (data?: string | Uint8Array) => {
          if (data) body += data.toString();
          return mockRes;
        },
      } as unknown as ServerResponse;

      const handled = await serveStaticFile(mockReq, mockRes, {
        distPath: "/virtual/dist",
        fileStorage: memoryStorage,
      });

      expect(handled).toBe(true);
      expect(statusCode).toBe(500);
      expect(body).toBe("Internal Server Error");
    });

    it("returns 500 when sending static asset response throws (CRIT-005)", async () => {
      const { MemoryFileStorage } = await import("../file_storage.js");
      const memoryStorage = new MemoryFileStorage({
        "/virtual/dist/index.html": "content",
      });

      let statusCode: number | undefined;
      let body = "";
      let callCount = 0;

      const mockReq = {
        method: "GET",
        url: "/index.html",
        headers: {},
      } as IncomingMessage;

      const mockRes = {
        get headersSent() {
          return false;
        },
        writeHead: (status: number) => {
          callCount++;
          if (callCount === 1) {
            throw new Error("Socket write failed");
          }
          statusCode = status;
          return mockRes;
        },
        end: (data?: string | Uint8Array) => {
          if (data) body += data.toString();
          return mockRes;
        },
      } as unknown as ServerResponse;

      const handled = await serveStaticFile(mockReq, mockRes, {
        distPath: "/virtual/dist",
        fileStorage: memoryStorage,
      });

      expect(handled).toBe(true);
      expect(statusCode).toBe(500);
      expect(body).toBe("Internal Server Error");
    });

    it("returns 500 when sending fallback HTML response throws (CRIT-005)", async () => {
      const { MemoryFileStorage } = await import("../file_storage.js");
      const memoryStorage = new MemoryFileStorage({});

      let statusCode: number | undefined;
      let body = "";
      let callCount = 0;

      const mockReq = {
        method: "GET",
        url: "/app-route",
        headers: { accept: "text/html" },
      } as IncomingMessage;

      const mockRes = {
        get headersSent() {
          return false;
        },
        writeHead: (status: number) => {
          callCount++;
          if (callCount === 1) {
            throw new Error("Socket broken on fallback");
          }
          statusCode = status;
          return mockRes;
        },
        end: (data?: string | Uint8Array) => {
          if (data) body += data.toString();
          return mockRes;
        },
      } as unknown as ServerResponse;

      const handled = await serveStaticFile(mockReq, mockRes, {
        distPath: "/virtual/dist",
        fileStorage: memoryStorage,
        fallbackHtml: "<html><body>Fallback</body></html>",
      });

      expect(handled).toBe(true);
      expect(statusCode).toBe(500);
      expect(body).toBe("Internal Server Error");
    });

    it("handles malformed URI decoding during traversal check safely without logging side-effects (MIN-005)", async () => {
      const debugSpy = vi.spyOn(defaultLogger, "debug");

      // Malformed UTF-8 percent-encoding
      const malformedResult = checkPathTraversal("/virtual/dist", "/%E0%A4%A");
      expect(typeof malformedResult).toBe("boolean");
      expect(debugSpy).not.toHaveBeenCalled();

      // Malformed secondary decoding: "%25E0%25A4%25A" decodes once to "%E0%A4%A", then second decode fails
      const secondaryMalformedResult = checkPathTraversal("/virtual/dist", "/%25E0%25A4%25A");
      expect(typeof secondaryMalformedResult).toBe("boolean");
      expect(debugSpy).not.toHaveBeenCalled();

      debugSpy.mockRestore();
    });

    it("emits security warning log when URI decoding encounters malformed components (MIN-002)", () => {
      const logger = new NullLogger();
      const isTraversal = checkPathTraversal(
        "/virtual/dist",
        "/%E0%A4%A",
        logger,
        "192.168.1.10",
      );
      expect(typeof isTraversal).toBe("boolean");

      const warnLog = logger.warnLogs.find(
        (l) => l.context?.["operation"] === "static_serve_decode_error",
      );
      expect(warnLog).toBeDefined();
      expect(warnLog?.context?.["path"]).toBe("/%E0%A4%A");
      expect(warnLog?.context?.["clientIp"]).toBe("192.168.1.10");
      expect(warnLog?.context?.["error"]).toBeDefined();
    });
  });
});
