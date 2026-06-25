export interface ImageMeta {
  width: number
  height: number
  format: string
  preview: string
  canUndo: boolean
  canRedo: boolean
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type EditorMode = 'idle' | 'cropping' | 'rotating'

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'bmp' | 'tiff'

export interface HistoryEntry {
  label: string
}
