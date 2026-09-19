import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

export function PhotoAlbumModal({
  isOpen,
  onClose,
  onInsert,
  slotKeys = ['beforeImage', 'afterImage'],
  slots = [],
  templateTitle = 'Template',
}) {
  const [selectedImages, setSelectedImages] = useState([])
  const [imagesPerSlide, setImagesPerSlide] = useState(1)
  const [insertMode, setInsertMode] = useState('replace') // 'replace' | 'append'
  const [isLoading, setIsLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  // Reset or adjust default imagesPerSlide based on available slots when opened
  useEffect(() => {
    if (isOpen) {
      const maxSlots = Math.max(1, slotKeys.length || slots.length || 2)
      setImagesPerSlide(Math.min(1, maxSlots))
    }
  }, [isOpen, slotKeys, slots])

  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const maxSlotsPerSlide = Math.max(1, slotKeys.length || slots.length || 2)

  // Convert File object to Data URL
  const fileToDataUrl = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () =>
        resolve({
          id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: file.name,
          dataUrl: reader.result,
        })
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  const handleFilesAdded = async (files) => {
    if (!files || files.length === 0) return
    setIsLoading(true)
    try {
      const fileList = Array.from(files).filter(
        (f) =>
          f.type.startsWith('image/') ||
          /\.(png|jpe?g|webp|gif|svg|bmp|jfif|tiff?)$/i.test(f.name),
      )
      const readPromises = fileList.map(fileToDataUrl)
      const newImages = await Promise.all(readPromises)
      setSelectedImages((prev) => [...prev, ...newImages])
    } catch (err) {
      console.error('Error reading files:', err)
      alert('Failed to read some images. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleNativePicker = async () => {
    if (
      typeof window !== 'undefined' &&
      Boolean(window.__TAURI_INTERNALS__ || window.__TAURI_IPC__)
    ) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const paths = await invoke('pick_open_files').catch(() => null)
        if (paths && Array.isArray(paths) && paths.length > 0) {
          setIsLoading(true)
          const readPromises = paths.map(async (p) => {
            const uint8Array = await invoke('read_binary_file', { path: p })
            const mimeType = p.endsWith('.png')
              ? 'image/png'
              : p.endsWith('.webp')
              ? 'image/webp'
              : 'image/jpeg'
            const b64 = btoa(String.fromCharCode(...new Uint8Array(uint8Array)))
            const name = p.split(/[/\\]/).pop() || 'Image'
            return {
              id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              name,
              dataUrl: `data:${mimeType};base64,${b64}`,
            }
          })
          const loaded = await Promise.all(readPromises)
          setSelectedImages((prev) => [...prev, ...loaded])
          setIsLoading(false)
          return
        }
      } catch (err) {
        console.warn('Native picker fallback to browser file input:', err)
      }
    }
    fileInputRef.current?.click()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer?.files?.length > 0) {
      handleFilesAdded(e.dataTransfer.files)
    }
  }

  const handleRemoveImage = (index) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleClearAll = () => {
    setSelectedImages([])
  }

  const handleConfirmInsert = () => {
    if (selectedImages.length === 0) return
    const imageUrls = selectedImages.map((img) => img.dataUrl)
    onInsert(imageUrls, Number(imagesPerSlide), insertMode)
    onClose()
  }

  const totalSlidesCalculated =
    selectedImages.length > 0
      ? Math.ceil(selectedImages.length / Number(imagesPerSlide))
      : 0

  const modalJsx = (
    <div className="pam-overlay" onClick={onClose}>
      <div className="pam-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="pam-header">
          <div className="pam-header__title-group">
            <div className="pam-header__icon">📸</div>
            <div>
              <h2 className="pam-header__title">Upload Photo Album</h2>
              <p className="pam-header__subtitle">
                Select photos to automatically generate formatted report slides
              </p>
            </div>
          </div>
          <button
            type="button"
            className="pam-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="pam-body">
          {/* Dropzone */}
          <div
            className={`pam-dropzone ${dragOver ? 'is-drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={handleNativePicker}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFilesAdded(e.target.files)}
            />
            <div className="pam-dropzone__icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="pam-dropzone__text">
              <span className="pam-dropzone__primary-text">
                Click or drag & drop images here
              </span>
              <span className="pam-dropzone__sub-text">
                Select multiple JPG, PNG, or WEBP photos
              </span>
            </div>
          </div>

          {/* Selected Images Strip */}
          {selectedImages.length > 0 && (
            <div className="pam-gallery">
              <div className="pam-gallery__meta">
                <span className="pam-gallery__badge">
                  {selectedImages.length} Image{selectedImages.length !== 1 ? 's' : ''} Ready
                </span>
                <button
                  type="button"
                  className="pam-gallery__clear-btn"
                  onClick={handleClearAll}
                >
                  Clear All
                </button>
              </div>
              <div className="pam-gallery__scroll">
                {selectedImages.map((img, idx) => (
                  <div key={img.id} className="pam-thumb">
                    <img src={img.dataUrl} alt={img.name} />
                    <span className="pam-thumb__badge">{idx + 1}</span>
                    <button
                      type="button"
                      className="pam-thumb__remove"
                      onClick={() => handleRemoveImage(idx)}
                      title="Remove image"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls Section */}
          <div className="pam-options">
            {/* Images Per Slide Segmented Pills */}
            <div className="pam-option-group">
              <label className="pam-option-label">Images Per Slide</label>
              <div className="pam-pills">
                {Array.from({ length: maxSlotsPerSlide }, (_, i) => i + 1).map(
                  (count) => (
                    <button
                      key={`pill-count-${count}`}
                      type="button"
                      className={`pam-pill ${
                        imagesPerSlide === count ? 'is-active' : ''
                      }`}
                      onClick={() => setImagesPerSlide(count)}
                    >
                      <span className="pam-pill__title">
                        {count} {count === 1 ? 'Photo' : 'Photos'} / Slide
                      </span>
                      <span className="pam-pill__sub">
                        {count === 1
                          ? `1st placeholder (${slots[0]?.label || 'Slot 1'})`
                          : count === 2
                          ? `1st & 2nd placeholders`
                          : `${count} placeholders`}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Mode Segmented Pills */}
            <div className="pam-option-group">
              <label className="pam-option-label">Insertion Mode</label>
              <div className="pam-pills">
                <button
                  type="button"
                  className={`pam-pill ${
                    insertMode === 'replace' ? 'is-active' : ''
                  }`}
                  onClick={() => setInsertMode('replace')}
                >
                  <span className="pam-pill__title">🔄 Replace Slides</span>
                  <span className="pam-pill__sub">
                    Overwrite current list
                  </span>
                </button>
                <button
                  type="button"
                  className={`pam-pill ${
                    insertMode === 'append' ? 'is-active' : ''
                  }`}
                  onClick={() => setInsertMode('append')}
                >
                  <span className="pam-pill__title">➕ Append Slides</span>
                  <span className="pam-pill__sub">Add after existing</span>
                </button>
              </div>
            </div>
          </div>

          {/* Summary Box */}
          {selectedImages.length > 0 && (
            <div className="pam-summary">
              <span className="pam-summary__icon">⚡</span>
              <div>
                <strong className="pam-summary__title">
                  {selectedImages.length} photo{selectedImages.length !== 1 ? 's' : ''} → {totalSlidesCalculated} slide{totalSlidesCalculated !== 1 ? 's' : ''} will be generated
                </strong>
                <span className="pam-summary__detail">
                  Distributed as {imagesPerSlide} photo{imagesPerSlide !== 1 ? 's' : ''} per slide in sequential placeholders.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pam-footer">
          <button type="button" className="pam-btn pam-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pam-btn pam-btn--primary"
            onClick={handleConfirmInsert}
            disabled={selectedImages.length === 0 || isLoading}
          >
            {isLoading
              ? 'Reading Files...'
              : `Create Photo Album (${selectedImages.length})`}
          </button>
        </div>
      </div>
    </div>
  )

  // Use React Portal to attach modal directly to document.body
  return createPortal(modalJsx, document.body)
}

export default PhotoAlbumModal
