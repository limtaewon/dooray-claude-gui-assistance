/// <reference types="vite/client" />

import type { CloverAPI } from '../../preload/index'

declare global {
  interface Window {
    api: CloverAPI
  }
}
