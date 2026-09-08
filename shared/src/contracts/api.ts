import type {
  LanInfoResponse,
  HealthCheckResponse,
  LivenessHealthResponse,
  DetailedHealthResponse,
} from "./schemas.js";

/**
 * Re-exporting validated network discovery response type inferred from LanInfoResponseSchema.
 */
export type { LanInfoResponse };

/**
 * Re-exporting validated health check telemetry response types.
 */
export type {
  HealthCheckResponse,
  LivenessHealthResponse,
  DetailedHealthResponse,
};
