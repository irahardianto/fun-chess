import { describe, it, expect } from "vitest";
import { MemoryFileStorage } from "../file_storage.js";

describe("MemoryFileStorage Unit Tests (MAJ-010, MAJ-016)", () => {
  it("stores and retrieves files in memory without disk I/O", async () => {
    const storage = new MemoryFileStorage({
      "/virtual/dist/index.html": "<html><body>Hello</body></html>",
    });

    const stat = await storage.stat("/virtual/dist/index.html");
    expect(stat.isDirectory).toBe(false);
    expect(stat.size).toBe(Buffer.byteLength("<html><body>Hello</body></html>"));

    const content = await storage.readFile("/virtual/dist/index.html");
    expect(content.toString("utf-8")).toBe("<html><body>Hello</body></html>");
  });

  it("recognizes added directories", async () => {
    const storage = new MemoryFileStorage();
    storage.addDirectory("/virtual/dist/assets");

    const stat = await storage.stat("/virtual/dist/assets");
    expect(stat.isDirectory).toBe(true);
  });

  it("throws ENOENT for missing files on stat and readFile", async () => {
    const storage = new MemoryFileStorage();

    await expect(storage.stat("/non/existent.txt")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(storage.readFile("/non/existent.txt")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("supports error simulation for custom error codes (e.g. EACCES, EMFILE)", async () => {
    const storage = new MemoryFileStorage({
      "/virtual/locked.txt": "data",
    });

    storage.setErrorSimulator((filePath, op) => {
      if (filePath === "/virtual/locked.txt" && op === "stat") {
        const err = Object.assign(new Error("Permission denied"), { code: "EACCES" });
        return err;
      }
      return undefined;
    });

    await expect(storage.stat("/virtual/locked.txt")).rejects.toMatchObject({
      code: "EACCES",
    });
  });

  it("resolves realpath for existing files and directories", async () => {
    const storage = new MemoryFileStorage({
      "/virtual/app.js": "console.log('hi')",
    });
    storage.addDirectory("/virtual/assets");

    await expect(storage.realpath("/virtual/app.js")).resolves.toBe("/virtual/app.js");
    await expect(storage.realpath("/virtual/assets")).resolves.toBe("/virtual/assets");
    await expect(storage.realpath("/virtual/missing.js")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
