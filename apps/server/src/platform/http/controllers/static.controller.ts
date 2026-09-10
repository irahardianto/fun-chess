import { IncomingMessage, ServerResponse } from "node:http";
import { Logger } from "../../logger/logger.interface.js";
import { IFileStorage } from "../file_storage.js";
import { serveStaticFile } from "../static_handler.js";
import type { HttpRateLimiter } from "../http_rate_limiter.js";

export interface StaticControllerOptions {
  distPath: string;
  fallbackHtml?: string;
  fileStorage?: IFileStorage;
  trustProxy?: boolean;
  notFoundRateLimiter?: HttpRateLimiter;
}

/**
 * Controller for static asset serving and SPA history mode routing (MIN-029).
 */
export class StaticController {
  private notFoundRateLimiter?: HttpRateLimiter;

  constructor(private readonly options: StaticControllerOptions) {
    this.notFoundRateLimiter = options.notFoundRateLimiter;
  }

  public setNotFoundRateLimiter(limiter?: HttpRateLimiter): void {
    this.notFoundRateLimiter = limiter;
  }

  public async serve(
    req: IncomingMessage,
    res: ServerResponse,
    logger?: Logger,
    correlationId?: string,
  ): Promise<boolean> {
    return serveStaticFile(
      req,
      res,
      {
        distPath: this.options.distPath,
        fallbackHtml: this.options.fallbackHtml,
        fileStorage: this.options.fileStorage,
        trustProxy: this.options.trustProxy,
        correlationId,
        notFoundRateLimiter: this.notFoundRateLimiter,
      },
      logger,
    );
  }
}
