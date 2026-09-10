import type { InjectionKey } from 'vue';
import type { ILocationProvider } from './location_provider';
import type { INetworkMonitor } from './network_monitor';

export const LOCATION_PROVIDER_KEY: InjectionKey<ILocationProvider> = Symbol('LOCATION_PROVIDER');
export const NETWORK_MONITOR_KEY: InjectionKey<INetworkMonitor> = Symbol('NETWORK_MONITOR');
