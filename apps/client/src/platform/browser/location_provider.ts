/**
 * Interface contract isolating browser location and URL navigation (MAJ-015).
 * Enables headless unit testing without window.location stubs or full DOM mocks.
 */
export interface ILocationProvider {
  readonly href: string;
  readonly origin: string;
  readonly host: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly protocol: string;
  assign(url: string): void;
  replace(url: string): void;
  reload(): void;
}

/**
 * Production implementation delegating directly to window.location.
 * Includes defensive guards for SSR and non-browser environments.
 */
export class BrowserLocationProvider implements ILocationProvider {
  get href(): string {
    return typeof window !== 'undefined' && window.location ? window.location.href : '';
  }

  get origin(): string {
    return typeof window !== 'undefined' && window.location ? window.location.origin : '';
  }

  get host(): string {
    return typeof window !== 'undefined' && window.location ? window.location.host : '';
  }

  get hostname(): string {
    return typeof window !== 'undefined' && window.location ? window.location.hostname : '';
  }

  get port(): string {
    return typeof window !== 'undefined' && window.location ? window.location.port : '';
  }

  get pathname(): string {
    return typeof window !== 'undefined' && window.location ? window.location.pathname : '';
  }

  get protocol(): string {
    return typeof window !== 'undefined' && window.location ? window.location.protocol : '';
  }

  assign(url: string): void {
    if (typeof window !== 'undefined' && window.location) {
      window.location.assign(url);
    }
  }

  replace(url: string): void {
    if (typeof window !== 'undefined' && window.location) {
      window.location.replace(url);
    }
  }

  reload(): void {
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  }
}

/**
 * Deterministic test double backed by an in-memory URL instance (MAJ-015).
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
