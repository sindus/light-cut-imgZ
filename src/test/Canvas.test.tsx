import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Canvas } from '../components/Canvas'
import type { ImageMeta } from '../types'

const mockImage: ImageMeta = {
  width: 800,
  height: 600,
  format: 'png',
  preview: 'data:image/png;base64,abc123',
}

describe('Canvas', () => {
  it('shows empty state when no image is loaded', () => {
    render(<Canvas image={null} mode="idle" onCropApply={vi.fn()} onCropCancel={vi.fn()} />)
    expect(screen.getByText(/open an image/i)).toBeInTheDocument()
    expect(screen.queryByTestId('canvas-image')).not.toBeInTheDocument()
  })

  it('renders the image preview when an image is loaded', () => {
    render(<Canvas image={mockImage} mode="idle" onCropApply={vi.fn()} onCropCancel={vi.fn()} />)
    const img = screen.getByTestId('canvas-image')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', mockImage.preview)
  })

  it('does not show CropOverlay when mode is idle', () => {
    render(<Canvas image={mockImage} mode="idle" onCropApply={vi.fn()} onCropCancel={vi.fn()} />)
    expect(screen.queryByLabelText(/crop selection/i)).not.toBeInTheDocument()
  })

  it('shows CropOverlay when mode is cropping', () => {
    render(
      <Canvas image={mockImage} mode="cropping" onCropApply={vi.fn()} onCropCancel={vi.fn()} />,
    )
    expect(screen.getByLabelText(/crop selection/i)).toBeInTheDocument()
  })
})
