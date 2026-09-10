import type {
  LanInfoResponse,
  LivenessHealthResponse,
  DetailedHealthResponse,
} from "@fun-chess/shared";

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
}

export async function fetchLanInfo(
  baseUrl: string,
  timeoutMs = 5000,
): Promise<HttpResponse<LanInfoResponse>> {
  const res = await fetch(`${baseUrl}/api/lan-info`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json()) as { data?: LanInfoResponse } & LanInfoResponse;
  const data = json.data ?? json;
  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}

export async function fetchHealth(
  baseUrl: string,
  timeoutMs = 5000,
): Promise<HttpResponse<LivenessHealthResponse>> {
  const res = await fetch(`${baseUrl}/api/health`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json()) as LivenessHealthResponse;
  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}

export async function fetchMetrics(
  baseUrl: string,
  timeoutMs = 5000,
): Promise<HttpResponse<DetailedHealthResponse>> {
  const res = await fetch(`${baseUrl}/metrics`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json()) as DetailedHealthResponse;
  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}

export async function fetchHealthDetail(
  baseUrl: string,
  timeoutMs = 5000,
): Promise<HttpResponse<DetailedHealthResponse>> {
  const res = await fetch(`${baseUrl}/health/detail`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json()) as DetailedHealthResponse;
  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}

