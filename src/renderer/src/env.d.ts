/// <reference types="vite/client" />

import type { ClaudayAPI } from '../../preload/index'

declare global {
  interface Window {
    api: ClaudayAPI
  }
}
