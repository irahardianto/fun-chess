import { LanInfoEnvelope } from "@fun-chess/shared";
import { IAddressingInfoProvider } from "../http.interface.js";

export interface LanInfoControllerOptions {
  addressService: IAddressingInfoProvider;
}

/**
 * Controller for host network addressing and QR discovery endpoints (MIN-029, MAJ-009).
 */
export class LanInfoController {
  private readonly addressService: IAddressingInfoProvider;

  constructor(options: LanInfoControllerOptions) {
    this.addressService = options.addressService;
  }

  public getLanInfo(port: number = 3000): LanInfoEnvelope {
    const info = this.addressService.getAddressingInfo(port || 3000);
    return { data: info };
  }
}
