import type {
  LanInfoResponse,
  HealthCheckResponse,
} from "./schemas.js";

/**
 * Re-exporting validated network discovery response type inferred from LanInfoResponseSchema.
 */
export type { LanInfoResponse };

/**
 * Re-exporting validated health check telemetry response type inferred from HealthCheckResponseSchema.
 */
export type { HealthCheckResponse };
