import { FetchApiClient } from './fetch_api_client';

export * from './api_client.interface';
export * from './fetch_api_client';
export * from './mock_api_client';

export const apiClient = new FetchApiClient();
