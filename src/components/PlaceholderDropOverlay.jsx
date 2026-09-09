import { useState, useRef } from 'react'
import { extractDroppedImage } from '../utils/pairUtils'

export function PlaceholderDropOverlay({ onImageBytesResolved, showToast }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
    if (!isDragOver) setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    try {
      const extracted = await extractDroppedImage(e)
      if (!extracted) {
        showToast('⚠️ Could not process dropped item. Please try dropping an image.')
        return
      }

      if (typeof extracted === 'string') {
        if (extracted.startsWith('data:image/')) {
          const b64 = extracted.replace(/^data:[^;]+;base64,/, '')
          const mime = extracted.substring(extracted.indexOf(':') + 1, extracted.indexOf(';')) || 'image/png'
          const binary = atob(b64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          onImageBytesResolved(bytes, mime)
          showToast('✓ Image dropped and imported successfully!')
          return
        }
        try {
          const response = await fetch(extracted)
          const blob = await response.blob()
          const buffer = await blob.arrayBuffer()
          onImageBytesResolved(new Uint8Array(buffer), blob.type || 'image/png')
          showToast('✓ Image dropped and imported successfully!')
          return
        } catch (err) {
          console.warn('Web image fetch failed:', err)
          showToast("⚠️ Could not load remote image directly — select a local file instead.")
          if (fileInputRef.current) fileInputRef.current.click()
          return
        }
      }

      // Extracted is a File or Blob
      const buffer = await extracted.arrayBuffer()
      onImageBytesResolved(new Uint8Array(buffer), extracted.type || 'image/png')
      showToast('✓ Image dropped and imported successfully!')
    } catch (err) {
      console.error('Failed to process dropped image:', err)
      showToast('⚠️ Failed to process dropped image.')
    }
  }

  const handleFileInputChange = async (e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    try {
      const buffer = await selectedFile.arrayBuffer()
      onImageBytesResolved(new Uint8Array(buffer), selectedFile.type)
      showToast('✓ Image file selected and imported!')
    } catch (err) {
      console.error('Failed to read selected image file:', err)
      showToast('⚠️ Failed to read image file.')
    }
  }

  return (
    <div
      className={`placeholder-drop-overlay${isDragOver ? ' is-active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: isDragOver ? 'auto' : 'none',
        zIndex: 99,
        border: isDragOver ? '3px dashed #6366f1' : 'none',
        backgroundColor: isDragOver ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {isDragOver && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            color: '#fff',
            padding: '16px 28px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            fontWeight: 600,
            fontSize: '1rem',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span>🖼️</span> Drop image here to replace on slide
        </div>
      )}
    </div>
  )
}
