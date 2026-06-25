import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Toolbar } from '../components/Toolbar'

function renderToolbar(props: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  const defaults = {
    hasImage: false,
    mode: 'idle' as const,
    isLoading: false,
    onOpen: vi.fn(),
    onCropMode: vi.fn(),
    onRotateMode: vi.fn(),
    onExportOpen: vi.fn(),
  }
  return render(<Toolbar {...defaults} {...props} />)
}

describe('Toolbar', () => {
  it('Open button is always enabled', () => {
    renderToolbar({ hasImage: false })
    expect(screen.getByRole('button', { name: /open image/i })).not.toBeDisabled()
  })

  it('Crop, Rotate, Export are disabled when no image is loaded', () => {
    renderToolbar({ hasImage: false })
    expect(screen.getByRole('button', { name: /crop/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /rotate/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled()
  })

  it('Crop, Rotate, Export are enabled when an image is loaded', () => {
    renderToolbar({ hasImage: true })
    expect(screen.getByRole('button', { name: /crop/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /rotate/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /export/i })).not.toBeDisabled()
  })

  it('All action buttons are disabled while loading', () => {
    renderToolbar({ hasImage: true, isLoading: true })
    expect(screen.getByRole('button', { name: /open image/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /crop/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /rotate/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled()
  })

  it('Clicking Open fires onOpen', async () => {
    const onOpen = vi.fn()
    renderToolbar({ onOpen })
    await userEvent.click(screen.getByRole('button', { name: /open image/i }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('Clicking Crop fires onCropMode when image is loaded', async () => {
    const onCropMode = vi.fn()
    renderToolbar({ hasImage: true, onCropMode })
    await userEvent.click(screen.getByRole('button', { name: /crop/i }))
    expect(onCropMode).toHaveBeenCalledOnce()
  })

  it('Crop button shows active state when mode is cropping', () => {
    renderToolbar({ hasImage: true, mode: 'cropping' })
    const btn = screen.getByRole('button', { name: /crop/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('Rotate button shows active state when mode is rotating', () => {
    renderToolbar({ hasImage: true, mode: 'rotating' })
    const btn = screen.getByRole('button', { name: /rotate/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })
})
