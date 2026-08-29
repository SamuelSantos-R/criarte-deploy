import type { CriarteApi } from "./index";

declare global {
  interface Window {
    criarte: CriarteApi;
  }
}

export {};
