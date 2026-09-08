import { useRef, useImperativeHandle, forwardRef, useMemo } from 'react'
import './i18n'
import { PowerPointViewer } from 'pptx-react-viewer'
import 'pptx-react-viewer/styles'
import { PlaceholderDropOverlay } from './components/PlaceholderDropOverlay'

export const FullCanvasEditor = forwardRef(function FullCanvasEditor(
  { fileBuffer, fileName, onContentChange, showToast },
  ref
) {
  const viewerRef = useRef(null)

  useImperativeHandle(ref, () => ({
    getContent: async () => {
      if (viewerRef.current && typeof viewerRef.current.getContent === 'function') {
        try {
          const contentBytes = await viewerRef.current.getContent()
          return contentBytes
        } catch (err) {
          console.warn('Failed to retrieve content from PowerPointViewer ref handle:', err)
        }
      }
      return fileBuffer ? new Uint8Array(fileBuffer) : null
    },
  }))

  const handleImageBytesResolved = (uint8Bytes) => {
    if (viewerRef.current && typeof viewerRef.current.replaceImage === 'function') {
      viewerRef.current.replaceImage(uint8Bytes)
    } else if (onContentChange) {
      showToast('✓ Image dropped for slide replace!')
    }
  }

  const contentUint8 = useMemo(() => {
    return fileBuffer ? new Uint8Array(fileBuffer) : new Uint8Array()
  }, [fileBuffer])

  if (!fileBuffer || contentUint8.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#94a3b8',
        }}
      >
        No presentation buffer available for WYSIWYG Editor.
      </div>
    )
  }

  return (
    <div
      className="full-canvas-editor"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#0f172a',
      }}
    >
      <PowerPointViewer
        ref={viewerRef}
        content={contentUint8}
        canEdit={true}
        fileName={fileName || 'Presentation.pptx'}
        onContentChange={(newContent) => {
          if (onContentChange) {
            onContentChange(newContent)
          }
        }}
      />
      <PlaceholderDropOverlay
        onImageBytesResolved={handleImageBytesResolved}
        showToast={showToast}
      />
    </div>
  )
})
