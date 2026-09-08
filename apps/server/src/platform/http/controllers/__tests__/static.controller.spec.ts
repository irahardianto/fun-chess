import { describe, it, expect } from "vitest";
import { StaticController } from "../static.controller.js";
import { MemoryFileStorage } from "../../file_storage.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { NullLogger } from "../../../logger/null_logger.js";

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
      end(chunk?: any) {
        if (chunk) writtenBody += chunk.toString();
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
      headers: {},
    } as unknown as IncomingMessage;

    const res = {
      writeHead(status: number, headers: Record<string, string>) {
        writtenStatus = status;
        writtenHeaders = headers;
        return this;
      },
      end(chunk?: any) {
        if (chunk) writtenBody += chunk.toString();
        return this;
      },
    } as unknown as ServerResponse;

    await controller.serve(req, res);

    expect(writtenStatus).toBe(200);
    expect(writtenHeaders["Content-Type"]).toContain("text/html");
    expect(writtenBody).toBe("<!DOCTYPE html><html><body>SPA Root</body></html>");
  });

  it("returns 404 for unknown asset path with file extension (MAJ-035)", async () => {
    const fileStorage = new MemoryFileStorage({});

    const controller = new StaticController({
      distPath: "/mock/dist",
      fileStorage,
      fallbackHtml: "<html><body>Fallback Page</body></html>",
    });

    let writtenStatus = 0;
    let writtenBody = "";

    const req = {
      method: "GET",
      url: "/play",
      headers: {
        accept: "text/html",
      },
    } as unknown as IncomingMessage;

    const res = {
      writeHead: (status: number) => {
        writtenStatus = status;
      },
      end: (data?: any) => {
        if (data) writtenBody = data.toString();
      },
      headersSent: false,
    } as unknown as ServerResponse;

    const served = await controller.serve(req, res);
    expect(served).toBe(true);
    expect(writtenStatus).toBe(200);
    expect(writtenBody).toContain("Fallback Page");
  });
});
