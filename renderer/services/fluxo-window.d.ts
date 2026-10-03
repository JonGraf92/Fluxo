import type { FluxoApi } from '../../electron/preload/index';

declare global {
  interface Window {
    fluxo: FluxoApi;
  }
}

export {};
