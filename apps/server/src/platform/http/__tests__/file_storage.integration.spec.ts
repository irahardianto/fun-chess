import { describe, it, expect } from "vitest";
import { NodeFileStorage } from "../file_storage.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

describe("NodeFileStorage Integration Tests (MAJ-010, MAJ-016)", () => {
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
    const missingPath = path.join(
      os.tmpdir(),
      `fc-missing-${Date.now()}-${Math.random()}.txt`,
    );

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
