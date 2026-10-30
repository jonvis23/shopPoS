/// <reference types="vite/client" />
import type { PosApi } from '../../shared/ipc'

declare global {
  interface Window {
    electronAPI: PosApi
  }
}

export {}
