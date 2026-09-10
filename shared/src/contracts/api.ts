import type {
  LanInfoResponse,
  LanInfoEnvelope,
  HealthCheckResponse,
  LivenessHealthResponse,
  DetailedHealthResponse,
} from "./schemas.js";

/**
 * Re-exporting validated network discovery response type inferred from LanInfoResponseSchema.
 */
export type { LanInfoResponse, LanInfoEnvelope };

/**
 * Re-exporting validated health check telemetry response types.
 */
export type {
  HealthCheckResponse,
  LivenessHealthResponse,
  DetailedHealthResponse,
};
