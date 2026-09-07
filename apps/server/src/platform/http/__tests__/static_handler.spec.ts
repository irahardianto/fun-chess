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

      const loggedWarnings: { msg: string; meta: any }[] = [];
      const mockLogger = {
        info: () => {},
        warn: (msg: string, meta: any) => {
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
          warn: (msg: string, meta: any) => {
            if (meta?.operation === "security_violation") warned = true;
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

      const loggedWarnings: any[] = [];
      const mockLogger = {
        info: () => {},
        warn: (msg: string, meta: any) => loggedWarnings.push({ msg, meta }),
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
      expect(loggedWarnings[0].meta.operation).toBe("security_violation");
      expect(loggedWarnings[0].meta.clientIp).toBe("172.16.0.22");
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

  describe("IFileStorage & Non-ENOENT Error Handling (MAJ-014, MAJ-016)", () => {
    it("serves files and handles 404s using injected MemoryFileStorage without disk I/O", async () => {
      const { MemoryFileStorage } = await import("../file_storage.js");
      const memoryStorage = new MemoryFileStorage({
        "/virtual/dist/index.html": "<!DOCTYPE html><html>Memory Dist</html>",
        "/virtual/dist/app.js": "console.log('memory');",
      });

      let statusCode: number | undefined;
      let headers: any;
      let body = "";

      const mockReq = {
        method: "GET",
        url: "/app.js",
        headers: {},
      } as IncomingMessage;

      const mockRes = {
        writeHead: (status: number, hdrs: any) => {
          statusCode = status;
          headers = hdrs;
          return mockRes;
        },
        end: (data?: any) => {
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
          const err = new Error("Permission denied") as any;
          err.code = "EACCES";
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
        end: (data?: any) => {
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
          const err = new Error("Too many open files") as any;
          err.code = "EMFILE";
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
        end: (data?: any) => {
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
  });
});
