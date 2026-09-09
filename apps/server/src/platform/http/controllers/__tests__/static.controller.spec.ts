import { describe, it, expect } from "vitest";
import { StaticController } from "../static.controller.js";
import { MemoryFileStorage } from "../../file_storage.js";
import type { IncomingMessage, ServerResponse } from "node:http";

describe("StaticController", () => {
  it("serves static assets from injected file storage (MAJ-035)", async () => {
    const fileStorage = new MemoryFileStorage({
      "/mock/dist/index.html": Buffer.from("<!DOCTYPE html><html><body>Test</body></html>"),
      "/mock/dist/style.css": Buffer.from("body { color: red; }"),
    });

    const controller = new StaticController({
      distPath: "/mock/dist",
      fileStorage,
      fallbackHtml: "<fallback>",
    });

    let writtenStatus = 0;
    let writtenHeaders: Record<string, string> = {};
    let writtenBody = "";

    const req = {
      method: "GET",
      url: "/style.css",
      headers: {},
    } as unknown as IncomingMessage;

    const res = {
      writeHead(status: number, headers: Record<string, string>) {
        writtenStatus = status;
        writtenHeaders = headers;
        return this;
      },
      end(chunk?: unknown) {
        if (chunk) writtenBody += String(chunk);
        return this;
      },
    } as unknown as ServerResponse;

    await controller.serve(req, res);

    expect(writtenStatus).toBe(200);
    expect(writtenHeaders["Content-Type"]).toContain("text/css");
    expect(writtenBody).toBe("body { color: red; }");
  });

  it("serves fallback HTML for SPA route when asset does not exist (MAJ-035)", async () => {
    const fileStorage = new MemoryFileStorage({
      "/mock/dist/index.html": Buffer.from("<!DOCTYPE html><html><body>SPA Root</body></html>"),
    });

    const controller = new StaticController({
      distPath: "/mock/dist",
      fileStorage,
      fallbackHtml: "<fallback>",
    });

    let writtenStatus = 0;
    let writtenHeaders: Record<string, string> = {};
    let writtenBody = "";

    const req = {
      method: "GET",
      url: "/room/ABCDEF",
      headers: {
        accept: "text/html",
      },
    } as unknown as IncomingMessage;

    const res = {
      writeHead(status: number, headers: Record<string, string>) {
        writtenStatus = status;
        writtenHeaders = headers;
        return this;
      },
      end(chunk?: unknown) {
        if (chunk) writtenBody += String(chunk);
        return this;
      },
    } as unknown as ServerResponse;

    await controller.serve(req, res);

    expect(writtenStatus).toBe(200);
    expect(writtenHeaders["Content-Type"]).toContain("text/html");
    expect(writtenBody).toBe("<!DOCTYPE html><html><body>SPA Root</body></html>");
  });

  it("returns 404 for unknown asset path with file extension (MIN-031, F-06)", async () => {
    const fileStorage = new MemoryFileStorage({});

    const controller = new StaticController({
      distPath: "/mock/dist",
      fileStorage,
      fallbackHtml: "<html><body>Fallback Page</body></html>",
    });

    let writtenStatus = 0;
    let writtenHeaders: Record<string, string> = {};
    let writtenBody = "";

    const req = {
      method: "GET",
      url: "/assets/missing.js",
      headers: {
        accept: "*/*",
      },
    } as unknown as IncomingMessage;

    const res = {
      writeHead: (status: number, headers?: Record<string, string>) => {
        writtenStatus = status;
        if (headers) writtenHeaders = headers;
        return res;
      },
      end: (data?: unknown) => {
        if (data) writtenBody = String(data);
        return res;
      },
      headersSent: false,
    } as unknown as ServerResponse;

    const served = await controller.serve(req, res);
    expect(served).toBe(true);
    expect(writtenStatus).toBe(404);
    expect(writtenHeaders["Content-Type"]).toContain("application/json");

    const parsed = JSON.parse(writtenBody);
    expect(parsed).toEqual({
      status: "error",
      code: 404,
      error: {
        code: "ERR_NOT_FOUND",
        message: "Not Found",
      },
    });
  });

  it("returns 404 when request path lacks extension and accept header does not accept HTML (ENH-014, F-06)", async () => {
    const fileStorage = new MemoryFileStorage({});

    const controller = new StaticController({
      distPath: "/mock/dist",
      fileStorage,
      fallbackHtml: "<html><body>Fallback Page</body></html>",
    });

    let writtenStatus = 0;
    let writtenHeaders: Record<string, string> = {};
    let writtenBody = "";

    const req = {
      method: "GET",
      url: "/unknown-api-endpoint",
      headers: {
        accept: "application/json",
      },
    } as unknown as IncomingMessage;

    const res = {
      writeHead: (status: number, headers?: Record<string, string>) => {
        writtenStatus = status;
        if (headers) writtenHeaders = headers;
        return res;
      },
      end: (data?: unknown) => {
        if (data) writtenBody = String(data);
        return res;
      },
      headersSent: false,
    } as unknown as ServerResponse;

    const served = await controller.serve(req, res);
    expect(served).toBe(true);
    expect(writtenStatus).toBe(404);
    expect(writtenHeaders["Content-Type"]).toContain("application/json");

    const parsed = JSON.parse(writtenBody);
    expect(parsed).toEqual({
      status: "error",
      code: 404,
      error: {
        code: "ERR_NOT_FOUND",
        message: "Not Found",
      },
    });
  });

  it("returns 500 when fileStorage throws unexpected system error (ENH-014)", async () => {
    const fileStorage = new MemoryFileStorage({});
    fileStorage.setErrorSimulator((_path, _op) => {
      const err = new Error("EIO: i/o error") as Error & { code?: string };
      err.code = "EIO";
      return err;
    });

    const controller = new StaticController({
      distPath: "/mock/dist",
      fileStorage,
      fallbackHtml: "<html><body>Fallback Page</body></html>",
    });

    let writtenStatus = 0;
    let writtenBody = "";

    const req = {
      method: "GET",
      url: "/app.js",
      headers: {},
    } as unknown as IncomingMessage;

    const res = {
      writeHead: (status: number) => {
        writtenStatus = status;
      },
      end: (data?: unknown) => {
        if (data) writtenBody = String(data);
      },
      headersSent: false,
    } as unknown as ServerResponse;

    const served = await controller.serve(req, res);
    expect(served).toBe(true);
    expect(writtenStatus).toBe(500);
    expect(writtenBody).toContain("Internal Server Error");
  });
});
