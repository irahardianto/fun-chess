import { stat, readFile, realpath } from "node:fs/promises";

export interface FileStat {
  isDirectory: boolean;
  size?: number;
}

export interface IFileStorage {
  stat(filePath: string): Promise<FileStat>;
  readFile(filePath: string): Promise<Buffer>;
  realpath(filePath: string): Promise<string>;
}

/**
 * Production Node.js filesystem adapter implementing IFileStorage (MAJ-016).
 * Canonicalizes real filesystem paths and resolves symlinks (MAJ-001).
 */
export class NodeFileStorage implements IFileStorage {
  async stat(filePath: string): Promise<FileStat> {
    const s = await stat(filePath);
    return {
      isDirectory: s.isDirectory(),
      size: s.size,
    };
  }

  async readFile(filePath: string): Promise<Buffer> {
    return await readFile(filePath);
  }

  async realpath(filePath: string): Promise<string> {
    return await realpath(filePath);
  }
}

/**
 * In-memory test double implementing IFileStorage (MAJ-016).
 * Eliminates disk I/O and temporary directory setup in unit tests.
 */
export class MemoryFileStorage implements IFileStorage {
  private readonly files = new Map<string, Buffer>();
  private readonly directories = new Set<string>();
  private errorSimulator?: (
    filePath: string,
    operation: "stat" | "readFile",
  ) => Error | undefined;

  constructor(initialFiles?: Record<string, string | Buffer>) {
    if (initialFiles) {
      for (const [filePath, content] of Object.entries(initialFiles)) {
        this.addFile(filePath, content);
      }
    }
  }

  public addFile(filePath: string, content: string | Buffer): void {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
    this.files.set(filePath, buf);
  }

  public addDirectory(dirPath: string): void {
    this.directories.add(dirPath);
  }

  public setErrorSimulator(
    simulator?: (filePath: string, operation: "stat" | "readFile") => Error | undefined,
  ): void {
    this.errorSimulator = simulator;
  }

  async realpath(filePath: string): Promise<string> {
    if (this.errorSimulator) {
      const simulated = this.errorSimulator(filePath, "stat");
      if (simulated) throw simulated;
    }
    if (this.files.has(filePath) || this.directories.has(filePath)) {
      return filePath;
    }
    const enoent = Object.assign(
      new Error(`ENOENT: no such file or directory, realpath '${filePath}'`),
      { code: "ENOENT" },
    );
    throw enoent;
  }

  async stat(filePath: string): Promise<FileStat> {
    if (this.errorSimulator) {
      const simulated = this.errorSimulator(filePath, "stat");
      if (simulated) throw simulated;
    }

    if (this.directories.has(filePath)) {
      return { isDirectory: true };
    }

    const file = this.files.get(filePath);
    if (file) {
      return { isDirectory: false, size: file.length };
    }

    const enoent = Object.assign(
      new Error(`ENOENT: no such file or directory, stat '${filePath}'`),
      { code: "ENOENT" },
    );
    throw enoent;
  }

  async readFile(filePath: string): Promise<Buffer> {
    if (this.errorSimulator) {
      const simulated = this.errorSimulator(filePath, "readFile");
      if (simulated) throw simulated;
    }

    const file = this.files.get(filePath);
    if (file) {
      return file;
    }

    const enoent = Object.assign(
      new Error(`ENOENT: no such file or directory, open '${filePath}'`),
      { code: "ENOENT" },
    );
    throw enoent;
  }
}
