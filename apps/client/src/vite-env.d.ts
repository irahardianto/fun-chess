/// <reference types="vite/client" />

import '@fun-chess/shared';

declare module '@fun-chess/shared' {
  interface AdaptiveRatingState {
    readonly volatility?: number;
  }
}
