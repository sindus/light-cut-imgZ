import { useCallback, useEffect, useRef } from 'react'
import { CropOverlay } from './CropOverlay'
import type { CropRect, EditorMode, ImageMeta } from '../types'

interface PickedColor {
  r: number
  g: number
  b: number
  a: number
}

interface CanvasProps {
  image: ImageMeta | null
  mode: EditorMode
  zoom: number
  showGrid?: boolean
  gridSize?: number
  recentFiles?: string[]
  onCropApply: (rect: CropRect) => void
  onCropCancel: () => void
  onCropRectChange?: (rect: CropRect) => void
  onZoomChange: (z: number | ((prev: number) => number)) => void
  onOpen: () => void
  onOpenByPaths?: (paths: string[]) => void
  onColorPick?: (color: PickedColor | null) => void
  onColorPickConfirm?: (color: PickedColor) => void
  onImageRef?: (el: HTMLImageElement | null) => void
}

const ZOOM_STEP = 1.15

// Magnifier constants
const MAG_GRID = 13  // pixels shown (odd so center is clear)
const MAG_CELL = 10  // display px per pixel
const MAG_SIZE = MAG_GRID * MAG_CELL  // = 130

export function Canvas({
  image,
  mode,
  zoom,
  showGrid = false,
  gridSize = 50,
  recentFiles = [],
  onCropApply,
  onCropCancel,
  onCropRectChange,
  onZoomChange,
  onOpen,
  onOpenByPaths,
  onColorPick,
  onColorPickConfirm,
  onImageRef,
}: CanvasProps) {
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const magnifierRef = useRef<HTMLCanvasElement | null>(null)
  const lastPickedRef = useRef<PickedColor | null>(null)
  const onImageRefStable = useRef(onImageRef)
  onImageRefStable.current = onImageRef
  const imgCallbackRef = useCallback((el: HTMLImageElement | null) => {
    onImageRefStable.current?.(el)
  }, [])

  // Build offscreen canvas from preview data URL for pixel reading
  useEffect(() => {
    if (!image?.preview) {
      offscreenRef.current = null
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new window.Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      offscreenRef.current = canvas
    }
    img.src = image.preview
  }, [image?.preview, image?.width, image?.height])

  // Hide magnifier when leaving eyedropper mode
  useEffect(() => {
    if (mode !== 'eyedropper' && magnifierRef.current) {
      magnifierRef.current.style.display = 'none'
    }
  }, [mode])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!image) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      onZoomChange((prev) => prev * delta)
    },
    [image, onZoomChange],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (mode !== 'eyedropper' || !image) return
      const rect = e.currentTarget.getBoundingClientRect()
      const containerX = e.clientX - rect.left
      const containerY = e.clientY - rect.top
      const imgX = Math.floor(containerX / zoom)
      const imgY = Math.floor(containerY / zoom)

      const displayWidth = Math.round(image.width * zoom)
      const displayHeight = Math.round(image.height * zoom)

      // Draw magnifier imperatively (no state update = no re-render on every move)
      const magCanvas = magnifierRef.current
      if (magCanvas) {
        const ctx = magCanvas.getContext('2d')
        const offscreen = offscreenRef.current
        if (ctx) {
          magCanvas.width = MAG_SIZE
          magCanvas.height = MAG_SIZE
          ctx.imageSmoothingEnabled = false

          if (offscreen) {
            const srcX = imgX - Math.floor(MAG_GRID / 2)
            const srcY = imgY - Math.floor(MAG_GRID / 2)
            ctx.drawImage(offscreen, srcX, srcY, MAG_GRID, MAG_GRID, 0, 0, MAG_SIZE, MAG_SIZE)
          } else {
            ctx.fillStyle = '#1e293b'
            ctx.fillRect(0, 0, MAG_SIZE, MAG_SIZE)
          }

          // Grid lines
          ctx.strokeStyle = 'rgba(0,0,0,0.25)'
          ctx.lineWidth = 0.5
          for (let i = 1; i < MAG_GRID; i++) {
            ctx.beginPath(); ctx.moveTo(i * MAG_CELL, 0); ctx.lineTo(i * MAG_CELL, MAG_SIZE); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(0, i * MAG_CELL); ctx.lineTo(MAG_SIZE, i * MAG_CELL); ctx.stroke()
          }

          // Center pixel highlight
          const cx = Math.floor(MAG_GRID / 2) * MAG_CELL
          const cy = Math.floor(MAG_GRID / 2) * MAG_CELL
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'
          ctx.lineWidth = 1.5
          ctx.strokeRect(cx + 0.5, cy + 0.5, MAG_CELL - 1, MAG_CELL - 1)
        }

        // Position: prefer bottom-right of cursor, flip if near edges
        const gapX = 20
        const gapY = 20
        const rightX = containerX + gapX
        const leftX = containerX - MAG_SIZE - gapX
        const belowY = containerY + gapY
        const aboveY = containerY - MAG_SIZE - gapY
        const posX = rightX + MAG_SIZE <= displayWidth ? rightX : Math.max(0, leftX)
        const posY = belowY + MAG_SIZE <= displayHeight ? belowY : Math.max(0, aboveY)

        magCanvas.style.left = `${posX}px`
        magCanvas.style.top = `${posY}px`
        magCanvas.style.display = 'block'
      }

      // Pick color
      if (imgX < 0 || imgY < 0 || imgX >= image.width || imgY >= image.height) {
        onColorPick?.(null)
        return
      }
      const offscreen = offscreenRef.current
      if (!offscreen) { onColorPick?.(null); return }
      const ctx = offscreen.getContext('2d')
      if (!ctx) { onColorPick?.(null); return }
      const [r, g, b, a] = ctx.getImageData(imgX, imgY, 1, 1).data
      const color: PickedColor = { r, g, b, a }
      lastPickedRef.current = color
      onColorPick?.(color)
    },
    [mode, zoom, image, onColorPick],
  )

  const handleMouseLeave = useCallback(() => {
    if (mode === 'eyedropper') {
      onColorPick?.(null)
      if (magnifierRef.current) magnifierRef.current.style.display = 'none'
    }
  }, [mode, onColorPick])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (mode !== 'eyedropper' || !image) return
      const rect = e.currentTarget.getBoundingClientRect()
      const imgX = Math.floor((e.clientX - rect.left) / zoom)
      const imgY = Math.floor((e.clientY - rect.top) / zoom)
      if (imgX < 0 || imgY < 0 || imgX >= image.width || imgY >= image.height) return

      // Try offscreen canvas for precise pixel read; fall back to last hovered color
      const offscreen = offscreenRef.current
      if (offscreen) {
        const ctx = offscreen.getContext('2d')
        if (ctx) {
          const [r, g, b, a] = ctx.getImageData(imgX, imgY, 1, 1).data
          onColorPickConfirm?.({ r, g, b, a })
          return
        }
      }
      if (lastPickedRef.current) {
        onColorPickConfirm?.(lastPickedRef.current)
      }
    },
    [mode, zoom, image, onColorPickConfirm],
  )

  if (!image) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500 select-none">
        <div
          className="flex flex-col items-center gap-4 cursor-pointer hover:text-slate-400 transition-colors"
          onClick={onOpen}
          role="button"
          aria-label="Open image"
        >
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="opacity-30"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <p className="text-sm">Open an image to get started</p>
          <p className="text-xs opacity-50">Click here or use File → Open</p>
        </div>

        {recentFiles.length > 0 && (
          <div className="mt-2 w-72">
            <p className="text-xs text-slate-600 mb-2 text-center uppercase tracking-wider">Recent</p>
            <div className="flex flex-col gap-0.5">
              {recentFiles.map((path) => (
                <button
                  key={path}
                  onClick={() => onOpenByPaths?.([path])}
                  className="text-left text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 px-3 py-1.5 rounded transition-colors truncate"
                  title={path}
                >
                  {path.split('/').pop()}
                  <span className="text-slate-700 ml-2 text-xs">{path.replace(/\/[^/]+$/, '')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const displayWidth = Math.round(image.width * zoom)
  const displayHeight = Math.round(image.height * zoom)
  const isEyedropper = mode === 'eyedropper'

  return (
    <div
      className="flex-1 overflow-auto flex items-start justify-start bg-slate-800/50"
      style={{ cursor: 'default' }}
      onWheel={handleWheel}
    >
      <div
        className="relative m-auto"
        style={{
          width: displayWidth,
          height: displayHeight,
          flexShrink: 0,
          cursor: isEyedropper ? 'crosshair' : 'default',
        }}
        onMouseMove={isEyedropper ? handleMouseMove : undefined}
        onMouseLeave={isEyedropper ? handleMouseLeave : undefined}
        onClick={isEyedropper ? handleClick : undefined}
      >
        <img
          src={image.preview}
          alt="Editing canvas"
          width={displayWidth}
          height={displayHeight}
          className="block"
          draggable={false}
          data-testid="canvas-image"
          ref={imgCallbackRef}
          style={{ imageRendering: zoom >= 3 ? 'pixelated' : 'auto' }}
        />

        {showGrid && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: [
                'linear-gradient(rgba(128,128,128,0.25) 1px, transparent 1px)',
                'linear-gradient(90deg, rgba(128,128,128,0.25) 1px, transparent 1px)',
              ].join(','),
              backgroundSize: `${gridSize * zoom}px ${gridSize * zoom}px`,
            }}
          />
        )}

        {mode === 'cropping' && (
          <CropOverlay
            imageWidth={image.width}
            imageHeight={image.height}
            onApply={onCropApply}
            onCancel={onCropCancel}
            onCropRectChange={onCropRectChange}
          />
        )}

        {/* Magnifier — always in DOM when image loaded, shown imperatively in eyedropper mode */}
        <canvas
          ref={magnifierRef}
          className="absolute pointer-events-none z-20 rounded overflow-hidden border border-white/25 shadow-xl"
          style={{ display: 'none', imageRendering: 'pixelated' }}
        />
      </div>
    </div>
  )
}
