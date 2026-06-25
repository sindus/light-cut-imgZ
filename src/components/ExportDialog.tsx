import { useEffect, useRef, useState } from 'react'
import type { ExportFormat } from '../types'

interface ExportDialogProps {
  open: boolean
  isLoading: boolean
  onExport: (format: ExportFormat, quality?: number) => void
  onClose: () => void
}

const FORMATS: Array<{ value: ExportFormat; label: string; supportsQuality: boolean }> = [
  { value: 'png', label: 'PNG', supportsQuality: false },
  { value: 'jpeg', label: 'JPEG', supportsQuality: true },
  { value: 'webp', label: 'WebP', supportsQuality: true },
  { value: 'bmp', label: 'BMP', supportsQuality: false },
  { value: 'tiff', label: 'TIFF', supportsQuality: false },
]

export function ExportDialog({ open, isLoading, onExport, onClose }: ExportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState(90)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      dialog.showModal()
    } else {
      dialog.close()
    }
  }, [open])

  const selectedFormat = FORMATS.find((f) => f.value === format)!

  const handleExport = () => {
    onExport(format, selectedFormat.supportsQuality ? quality : undefined)
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="rounded-lg bg-slate-800 text-slate-100 border border-slate-600 p-0 min-w-80 backdrop:bg-black/60"
    >
      <div className="px-5 py-4 border-b border-slate-700">
        <h2 className="text-base font-semibold">Export Image</h2>
      </div>

      <div className="px-5 py-4 flex flex-col gap-4">
        <fieldset>
          <legend className="text-xs text-slate-400 uppercase tracking-wider mb-2">Format</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {FORMATS.map((f) => (
              <label
                key={f.value}
                className={`cursor-pointer text-center py-1.5 rounded text-sm border transition-colors ${
                  format === f.value
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value={f.value}
                  checked={format === f.value}
                  onChange={() => setFormat(f.value)}
                  className="sr-only"
                />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>

        {selectedFormat.supportsQuality && (
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">
              Quality: {quality}%
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full accent-indigo-500"
              aria-label="Export quality"
              data-testid="quality-slider"
            />
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-slate-700 flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="px-4 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleExport}
          disabled={isLoading}
          className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50"
          data-testid="export-button"
        >
          {isLoading ? 'Exporting…' : 'Export'}
        </button>
      </div>
    </dialog>
  )
}
