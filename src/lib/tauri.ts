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
    filename: raw.filename as string | undefined,
    path: raw.path as string | undefined,
  }
}

export interface OpenedImage {
  tabId: string
  meta: ImageMeta
}

export async function openImages(): Promise<OpenedImage[]> {
  const results = await invoke<Array<{ tab_id: string; meta: Record<string, unknown> }>>(
    'open_images',
  )
  return results.map((r) => ({ tabId: r.tab_id, meta: mapMeta(r.meta) }))
}

export async function openImagesByPaths(paths: string[]): Promise<OpenedImage[]> {
  const results = await invoke<Array<{ tab_id: string; meta: Record<string, unknown> }>>(
    'open_images_by_paths',
    { paths },
  )
  return results.map((r) => ({ tabId: r.tab_id, meta: mapMeta(r.meta) }))
}

export async function cropImage(tabId: string, rect: CropRect): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('crop_image', {
    tabId,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  })
  return mapMeta(raw)
}

export async function resizeImage(tabId: string, width: number, height: number): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('resize_image', { tabId, width, height })
  return mapMeta(raw)
}

export type Anchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

export async function canvasResizeImage(
  tabId: string,
  width: number,
  height: number,
  anchor: Anchor,
  fill: [number, number, number, number],
): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('canvas_resize_image', {
    tabId, width, height, anchor, fill,
  })
  return mapMeta(raw)
}

export async function flipImage(tabId: string, direction: 'horizontal' | 'vertical'): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('flip_image', { tabId, direction })
  return mapMeta(raw)
}

export async function rotateImage(tabId: string, degrees: number): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('rotate_image', { tabId, degrees })
  return mapMeta(raw)
}

export async function exportImage(
  tabId: string,
  format: ExportFormat,
  quality?: number,
): Promise<void> {
  return invoke<void>('export_image', { tabId, format, quality: quality ?? null })
}

export async function undoImage(tabId: string): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('undo_image', { tabId })
  return mapMeta(raw)
}

export async function redoImage(tabId: string): Promise<ImageMeta> {
  const raw = await invoke<Record<string, unknown>>('redo_image', { tabId })
  return mapMeta(raw)
}

export async function closeTab(tabId: string): Promise<void> {
  return invoke<void>('close_tab', { tabId })
}

export async function closeAllTabs(): Promise<void> {
  return invoke<void>('close_all_tabs')
}

export async function closeOtherTabs(tabId: string): Promise<void> {
  return invoke<void>('close_other_tabs', { tabId })
}

export interface ExifField {
  tag: string
  value: string
}

export async function getExif(tabId: string): Promise<ExifField[]> {
  return invoke<ExifField[]>('get_exif', { tabId })
}

export async function stripExif(tabId: string): Promise<boolean> {
  return invoke<boolean>('strip_exif', { tabId })
}
