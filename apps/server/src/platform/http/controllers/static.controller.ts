import { IncomingMessage, ServerResponse } from "node:http";
import { Logger } from "../../logger/logger.interface.js";
import { IFileStorage } from "../file_storage.js";
import { serveStaticFile } from "../static_handler.js";

export interface StaticControllerOptions {
  distPath: string;
  fallbackHtml?: string;
  fileStorage?: IFileStorage;
  trustProxy?: boolean;
}

/**
 * Controller for static asset serving and SPA history mode routing (MIN-029).
 */
export class StaticController {
  constructor(private readonly options: StaticControllerOptions) {}

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
      },
      logger,
    );
  }
}
