import { LanInfoResponse } from "@fun-chess/shared";
import { IAddressingInfoProvider } from "../http_server.js";

export interface LanInfoControllerOptions {
  addressService: IAddressingInfoProvider;
}

/**
 * Controller for host network addressing and QR discovery endpoints (MIN-029).
 */
export class LanInfoController {
  private readonly addressService: IAddressingInfoProvider;

  constructor(options: LanInfoControllerOptions) {
    this.addressService = options.addressService;
  }

  public getLanInfo(port: number): LanInfoResponse {
    return this.addressService.getAddressingInfo(port);
  }
}
