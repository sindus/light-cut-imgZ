import { useCallback, useState } from 'react'
import { cropImage, exportImage, openImage, rotateImage } from '../lib/tauri'
import type { CropRect, EditorMode, ExportFormat, ImageMeta } from '../types'

interface ImageEditorState {
  image: ImageMeta | null
  mode: EditorMode
  isLoading: boolean
  error: string | null
}

interface ImageEditorActions {
  handleOpen: () => Promise<void>
  handleCropApply: (rect: CropRect) => Promise<void>
  handleRotate: (degrees: number) => Promise<void>
  handleExport: (format: ExportFormat, quality?: number) => Promise<void>
  enterCropMode: () => void
  exitCropMode: () => void
  enterRotateMode: () => void
  exitRotateMode: () => void
  clearError: () => void
}

export function useImageEditor(): ImageEditorState & ImageEditorActions {
  const [image, setImage] = useState<ImageMeta | null>(null)
  const [mode, setMode] = useState<EditorMode>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpen = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await openImage()
      if (result) {
        setImage(result)
        setMode('idle')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleCropApply = useCallback(async (rect: CropRect) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await cropImage(rect)
      setImage(result)
      setMode('idle')
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleRotate = useCallback(async (degrees: number) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await rotateImage(degrees)
      setImage(result)
      setMode('idle')
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleExport = useCallback(async (format: ExportFormat, quality?: number) => {
    setIsLoading(true)
    setError(null)
    try {
      await exportImage(format, quality)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const enterCropMode = useCallback(() => setMode('cropping'), [])
  const exitCropMode = useCallback(() => setMode('idle'), [])
  const enterRotateMode = useCallback(() => setMode('rotating'), [])
  const exitRotateMode = useCallback(() => setMode('idle'), [])
  const clearError = useCallback(() => setError(null), [])

  return {
    image,
    mode,
    isLoading,
    error,
    handleOpen,
    handleCropApply,
    handleRotate,
    handleExport,
    enterCropMode,
    exitCropMode,
    enterRotateMode,
    exitRotateMode,
    clearError,
  }
}
