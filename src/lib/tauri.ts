import { invoke } from '@tauri-apps/api/core'
import type { CropRect, ExportFormat, ImageMeta } from '../types'

function mapMeta(raw: Record<string, unknown>): ImageMeta {
  return {
    width: raw.width as number,
    height: raw.height as number,
    format: raw.format as string,
    preview: raw.preview as string,
    canUndo: (raw.can_undo as boolean) ?? false,
    canRedo: (raw.can_redo as boolean) ?? false,
  }
}

export async function openImage(): Promise<ImageMeta | null> {
  const raw = await invoke<Record<string, unknown> | null>('open_image')
  return raw ? mapMeta(raw) : null
}

export async function cropImage(rect: CropRect): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('crop_image', {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  })
  return mapMeta(raw)
}

export async function rotateImage(degrees: number): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('rotate_image', { degrees })
  return mapMeta(raw)
}

export async function exportImage(format: ExportFormat, quality?: number): Promise<void> {
  return invoke<void>('export_image', { format, quality: quality ?? null })
}

export async function undoImage(): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('undo_image')
  return mapMeta(raw)
}

export async function redoImage(): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('redo_image')
  return mapMeta(raw)
}
