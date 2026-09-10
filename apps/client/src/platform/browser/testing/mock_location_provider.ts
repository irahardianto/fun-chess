import type { ILocationProvider } from '../location_provider';

/**
 * Deterministic test double backed by an in-memory URL instance (MAJ-015, BLK-02).
 */
export class MockLocationProvider implements ILocationProvider {
  private url: URL;

  constructor(initialUrl = 'http://localhost:3000/') {
    this.url = new URL(initialUrl);
  }

  get href(): string {
    return this.url.href;
  }

  get origin(): string {
    return this.url.origin;
  }

  get host(): string {
    return this.url.host;
  }

  get hostname(): string {
    return this.url.hostname;
  }

  get port(): string {
    return this.url.port;
  }

  get pathname(): string {
    return this.url.pathname;
  }

  get protocol(): string {
    return this.url.protocol;
  }

  assign(url: string): void {
    this.url = new URL(url, this.url.origin);
  }

  replace(url: string): void {
    this.url = new URL(url, this.url.origin);
  }

  reload(): void {
    // Deterministic no-op in tests
  }

  setUrl(newUrl: string): void {
    this.url = new URL(newUrl);
  }
}
