import { describe, it, expect } from "vitest";
import { MemoryFileStorage, NodeFileStorage } from "../file_storage.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

describe("IFileStorage & Adapters (MAJ-016)", () => {
  describe("MemoryFileStorage", () => {
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

  describe("NodeFileStorage", () => {
    it("reads real files and stats from disk", async () => {
      const storage = new NodeFileStorage();
      const tmpFile = path.join(os.tmpdir(), `fc-test-${Date.now()}.txt`);
      await fs.writeFile(tmpFile, "node-storage-test");

      try {
        const stat = await storage.stat(tmpFile);
        expect(stat.isDirectory).toBe(false);
        expect(stat.size).toBe(Buffer.byteLength("node-storage-test"));

        const content = await storage.readFile(tmpFile);
        expect(content.toString("utf-8")).toBe("node-storage-test");
      } finally {
        await fs.unlink(tmpFile).catch(() => {});
      }
    });

    it("correctly identifies directories via stat (MAJ-044)", async () => {
      const storage = new NodeFileStorage();
      const tmpDir = path.join(os.tmpdir(), `fc-dir-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      try {
        const stat = await storage.stat(tmpDir);
        expect(stat.isDirectory).toBe(true);
      } finally {
        await fs.rmdir(tmpDir).catch(() => {});
      }
    });

    it("throws ENOENT for missing files on stat and readFile (MAJ-044)", async () => {
      const storage = new NodeFileStorage();
      const missingPath = path.join(os.tmpdir(), `fc-missing-${Date.now()}-${Math.random()}.txt`);

      await expect(storage.stat(missingPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(storage.readFile(missingPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("throws EISDIR when calling readFile on a directory (MAJ-044)", async () => {
      const storage = new NodeFileStorage();
      const tmpDir = path.join(os.tmpdir(), `fc-eisdir-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      try {
        await expect(storage.readFile(tmpDir)).rejects.toMatchObject({
          code: "EISDIR",
        });
      } finally {
        await fs.rmdir(tmpDir).catch(() => {});
      }
    });

    it("resolves canonical realpath on real filesystem and resolves symlinks (MAJ-001, MAJ-044)", async () => {
      const storage = new NodeFileStorage();
      const tmpDir = path.join(os.tmpdir(), `fc-symlink-test-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      const realFile = path.join(tmpDir, "real.txt");
      const symlinkFile = path.join(tmpDir, "symlink.txt");
      await fs.writeFile(realFile, "target content");
      await fs.symlink(realFile, symlinkFile);

      try {
        const canonicalTarget = await storage.realpath(realFile);
        const canonicalSymlink = await storage.realpath(symlinkFile);
        expect(canonicalSymlink).toBe(canonicalTarget);
      } finally {
        await fs.unlink(symlinkFile).catch(() => {});
        await fs.unlink(realFile).catch(() => {});
        await fs.rmdir(tmpDir).catch(() => {});
      }
    });
  });
});
