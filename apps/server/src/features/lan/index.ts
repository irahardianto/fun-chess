/**
 * Public API for features/lan.
 * Cross-module callers must import exclusively from this entry point.
 */
export {
  RelayAddressService,
  SystemNetworkInterfaceProvider,
  StaticNetworkInterfaceProvider,
  normalizePublicUrl,
  extractHostnameFromUrl,
} from "./relay_address.service.js";
export { MockRelayAddressService } from "./mock_relay_address.service.js";
export type {
  IRelayAddressService,
  INetworkInterfaceProvider,
  RelayAddressConfig,
  LanInfoResponse,
} from "./relay_address.service.js";
