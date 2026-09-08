/**
 * Public API for features/lan.
 * Cross-module callers must import exclusively from this entry point.
 */
export {
  RelayAddressService,
  MockRelayAddressService,
  normalizePublicUrl,
  extractHostnameFromUrl,
  getAddressingInfo,
  getRelayAddressingInfo,
  generateRelayJoinUrl,
  isCloudRelay,
  getRelayLocalLanIp,
  getAllRelayLanInterfaces,
} from "./relay_address.service.js";
export type {
  IRelayAddressService,
  RelayAddressConfig,
  LanInfoResponse,
} from "./relay_address.service.js";
