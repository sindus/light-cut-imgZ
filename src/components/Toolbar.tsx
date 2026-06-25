import type { EditorMode } from '../types'

interface ToolbarProps {
  hasImage: boolean
  mode: EditorMode
  isLoading: boolean
  onOpen: () => void
  onCropMode: () => void
  onRotateMode: () => void
  onExportOpen: () => void
}

export function Toolbar({
  hasImage,
  mode,
  isLoading,
  onOpen,
  onCropMode,
  onRotateMode,
  onExportOpen,
}: ToolbarProps) {
  const disabled = !hasImage || isLoading
  const cropActive = mode === 'cropping'
  const rotateActive = mode === 'rotating'

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700 select-none">
      <span className="text-lg font-bold tracking-tight text-white mr-4">
        light-cut-img<span className="text-indigo-400">Z</span>
      </span>

      <button
        onClick={onOpen}
        disabled={isLoading}
        className="toolbar-btn"
        title="Open image"
        aria-label="Open image"
      >
        <OpenIcon />
        Open
      </button>

      <div className="w-px h-5 bg-slate-600" />

      <button
        onClick={onCropMode}
        disabled={disabled}
        className={`toolbar-btn ${cropActive ? 'toolbar-btn--active' : ''}`}
        title="Crop"
        aria-label="Crop"
        aria-pressed={cropActive}
      >
        <CropIcon />
        Crop
      </button>

      <button
        onClick={onRotateMode}
        disabled={disabled}
        className={`toolbar-btn ${rotateActive ? 'toolbar-btn--active' : ''}`}
        title="Rotate"
        aria-label="Rotate"
        aria-pressed={rotateActive}
      >
        <RotateIcon />
        Rotate
      </button>

      <div className="flex-1" />

      <button
        onClick={onExportOpen}
        disabled={disabled}
        className="toolbar-btn toolbar-btn--primary"
        title="Export"
        aria-label="Export"
      >
        <ExportIcon />
        Export
      </button>
    </header>
  )
}

function OpenIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function CropIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="6 2 6 6 2 6" />
      <polyline points="18 22 18 18 22 18" />
      <path d="M2 12h14v10" />
      <path d="M12 2v14H2" />
    </svg>
  )
}

function RotateIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
