import { vi } from 'vitest'
import type { ImageMeta } from '../../types'

export const mockImageMeta: ImageMeta = {
  width: 800,
  height: 600,
  format: 'png',
  preview:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
}

export const mockOpenImage = vi.fn().mockResolvedValue(mockImageMeta)
export const mockCropImage = vi.fn().mockResolvedValue(mockImageMeta)
export const mockRotateImage = vi.fn().mockResolvedValue(mockImageMeta)
export const mockExportImage = vi.fn().mockResolvedValue(undefined)

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((command: string) => {
    switch (command) {
      case 'open_image':
        return mockOpenImage()
      case 'crop_image':
        return mockCropImage()
      case 'rotate_image':
        return mockRotateImage()
      case 'export_image':
        return mockExportImage()
      default:
        return Promise.reject(new Error(`Unknown command: ${command}`))
    }
  }),
}))
