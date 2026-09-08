import type { IncomingMessage, ServerResponse } from "node:http";
import type { LanInfoResponse } from "@fun-chess/shared";
import type { ServerEnv } from "../config/env.js";
import type { Logger } from "../logger/logger.interface.js";
import type { IFileStorage } from "./file_storage.js";
import type { HttpRateLimiter } from "./http_rate_limiter.js";

/**
 * Storage count provider contract for health checks (MAJ-011).
 */
export interface IRoomCountProvider {
  count(): Promise<number>;
}

/**
 * Addressing provider contract for network info and relay status (MAJ-011).
 */
export interface IAddressingInfoProvider {
  getAddressingInfo(port: number): LanInfoResponse;
  isCloudRelay?(): boolean;
}

/**
 * Machine-readable business error payload inside HttpErrorEnvelope (MAJ-033).
 */
export interface HttpErrorBody {
  /** Machine-readable business error code in UPPER_SNAKE_CASE */
  code: string;
  /** Human-readable explanatory message */
  message: string;
  /** Optional structured context payload */
  details?: Record<string, unknown>;
  /** Optional tracing correlation UUID */
  correlationId?: string;
}

/**
 * Standardized HTTP error response envelope format (MAJ-033).
 * Conforms to api-design-principles.md.
 */
export interface HttpErrorEnvelope {
  /** Always "error" */
  status: "error";
  /** Redundant HTTP status code (400-599) matching the HTTP status header */
  code: number;
  /** Domain error details */
  error: HttpErrorBody;
}

export type HttpErrorResponse = HttpErrorEnvelope;

export interface HttpServerConfig {
  roomStore: IRoomCountProvider;
  relayAddressService?: IAddressingInfoProvider;
  /** @deprecated Use relayAddressService */
  lanService?: IAddressingInfoProvider;
  logger: Logger;
  port?: number;
  distPath?: string;
  allowedOrigins?: string[];
  env?: ServerEnv;
  fileStorage?: IFileStorage;
  getActiveSocketCount?: () => number;
  rateLimiter?: HttpRateLimiter;
}
