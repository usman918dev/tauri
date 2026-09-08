import { useState, useRef } from 'react'

export function PlaceholderDropOverlay({ onImageBytesResolved, showToast }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
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

    // 1. Check local dropped file
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      try {
        const buffer = await droppedFile.arrayBuffer()
        onImageBytesResolved(new Uint8Array(buffer), droppedFile.type)
        return
      } catch (err) {
        console.error('Failed to read local dropped file:', err)
        showToast('⚠️ Failed to read local image file.')
        return
      }
    }

    // 2. Check web image drag URL
    let imageUrl = e.dataTransfer.getData('text/uri-list')
    if (!imageUrl) {
      const htmlData = e.dataTransfer.getData('text/html')
      if (htmlData) {
        const match = htmlData.match(/src=["'](.*?)["']/i)
        if (match && match[1]) imageUrl = match[1]
      }
    }

    if (imageUrl) {
      try {
        const response = await fetch(imageUrl)
        if (!response.ok) throw new Error(`HTTP error ${response.status}`)
        const blob = await response.blob()
        const buffer = await blob.arrayBuffer()
        onImageBytesResolved(new Uint8Array(buffer), blob.type || 'image/png')
        showToast('✓ Image dropped and imported successfully!')
      } catch (err) {
        console.warn('Web image fetch failed (generic CORS/network fallback):', err)
        showToast("⚠️ Couldn't load that image directly — drop a local file instead")
        if (fileInputRef.current) {
          fileInputRef.current.click()
        }
      }
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
