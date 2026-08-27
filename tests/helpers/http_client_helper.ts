import { LanInfoResponse, HealthCheckResponse } from "@fun-chess/shared";

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
}

export async function fetchLanInfo(
  baseUrl: string,
): Promise<HttpResponse<LanInfoResponse>> {
  const res = await fetch(`${baseUrl}/api/lan-info`);
  const data = (await res.json()) as LanInfoResponse;
  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}

export async function fetchHealth(
  baseUrl: string,
): Promise<HttpResponse<HealthCheckResponse>> {
  const res = await fetch(`${baseUrl}/api/health`);
  const data = (await res.json()) as HealthCheckResponse;
  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}
