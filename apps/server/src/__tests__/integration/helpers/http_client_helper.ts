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
): Promise<HttpResponse<LivenessHealthResponse>> {
  const res = await fetch(`${baseUrl}/api/health`);
  const data = (await res.json()) as LivenessHealthResponse;
  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}

export async function fetchMetrics(
  baseUrl: string,
): Promise<HttpResponse<DetailedHealthResponse>> {
  const res = await fetch(`${baseUrl}/metrics`);
  const data = (await res.json()) as DetailedHealthResponse;
  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}

export async function fetchHealthDetail(
  baseUrl: string,
): Promise<HttpResponse<DetailedHealthResponse>> {
  const res = await fetch(`${baseUrl}/health/detail`);
  const data = (await res.json()) as DetailedHealthResponse;
  return {
    status: res.status,
    headers: res.headers,
    data,
  };
}
