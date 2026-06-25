import { invoke } from '@tauri-apps/api/core'
import type { CropRect, ExportFormat, ImageMeta } from '../types'

export function openImage(): Promise<ImageMeta | null> {
  return invoke<ImageMeta | null>('open_image')
}

export function cropImage(rect: CropRect): Promise<ImageMeta> {
  return invoke<ImageMeta>('crop_image', {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  })
}

export function rotateImage(degrees: number): Promise<ImageMeta> {
  return invoke<ImageMeta>('rotate_image', { degrees })
}

export function exportImage(format: ExportFormat, quality?: number): Promise<void> {
  return invoke<void>('export_image', { format, quality: quality ?? null })
}
