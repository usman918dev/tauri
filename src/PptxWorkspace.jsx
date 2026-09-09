import { useState, useEffect, useRef } from 'react'
import { parsePptxForEditing, exportEditedPptx } from './report/pptxEditorUtils'
import { loadPptxEditorState, savePptxEditorState, clearPptxEditorState } from './utils/storage'
import { getDroppedImageAsDataUrl } from './utils/pairUtils'
import { QuickEditView } from './QuickEditView'
import { FullCanvasEditor } from './FullCanvasEditor'
export function PptxWorkspace({ 
  tabs = [], 
  setTabs = () => {}, 
  activeTabId = null, 
  setActiveTabId = () => {}, 
  onCloseTab = () => {}, 
  onOpenNew = () => {} 
}) {

  const activeTab = (Array.isArray(tabs) ? tabs.find((t) => t.id === activeTabId) : null) || null
  const file = activeTab?.file || null
  const fileBuffer = activeTab?.fileBuffer || null
  const parsedData = activeTab?.parsedData || null
  const activeSlideIndex = activeTab?.activeSlideIndex || 0
  const viewMode = activeTab?.viewMode || 'quick'

  const setFile = (f) => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, file: f } : t))
  const setFileBuffer = (buf) => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, fileBuffer: buf } : t))
  
  const setParsedData = (updater) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === activeTabId)
      if (idx === -1) return prev
      const nextData = typeof updater === 'function' ? updater(prev[idx].parsedData) : updater
      const newTabs = [...prev]
      newTabs[idx] = { ...prev[idx], parsedData: nextData }
      return newTabs
    })
  }
  
  const setActiveSlideIndex = (updater) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === activeTabId)
      if (idx === -1) return prev
      const nextIdx = typeof updater === 'function' ? updater(prev[idx].activeSlideIndex) : updater
      const newTabs = [...prev]
      newTabs[idx] = { ...prev[idx], activeSlideIndex: nextIdx }
      return newTabs
    })
  }

  const setViewMode = (updater) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === activeTabId)
      if (idx === -1) return prev
      const nextMode = typeof updater === 'function' ? updater(prev[idx].viewMode) : updater
      const newTabs = [...prev]
      newTabs[idx] = { ...prev[idx], viewMode: nextMode }
      return newTabs
    })
  }

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedElementId, setSelectedElementId] = useState(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isDraggingUpload, setIsDraggingUpload] = useState(false)

  const [dragOverElemId, setDragOverElemId] = useState(null)
  const imageInputRef = useRef(null)
  const [replacingElemId, setReplacingElemId] = useState(null)
  
  const fileBuffersRef = useRef({})
  const fileHandlesRef = useRef({})
  
  const fileBufferRef = { 
    get current() { return fileBuffersRef.current[activeTabId] },
    set current(val) { fileBuffersRef.current[activeTabId] = val }
  }
  const fileHandleRef = {
    get current() { return fileHandlesRef.current[activeTabId] },
    set current(val) { fileHandlesRef.current[activeTabId] = val }
  }

  const isHydratedRef = useRef(false)
  const fullCanvasRef = useRef(null)
  const [toastMessage, setToastMessage] = useState('')
  const [deferredPrompt, setDeferredPrompt] = useState(null)

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  }, [])

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 4000)
  }

  // Hydration is now handled globally, but we still load files into memory
  useEffect(() => {
    if (!Array.isArray(tabs) || tabs.length === 0) return
    tabs.forEach(t => {
      if (t.fileBuffer && !fileBuffersRef.current[t.id]) {
        fileBuffersRef.current[t.id] = t.fileBuffer
      }
    })
  }, [tabs])

  // Auto-parse new document tabs from App.jsx
  useEffect(() => {
    const parseNewTabs = async () => {
      const unparsed = Array.isArray(tabs) ? tabs.find(t => t.file && !t.fileBuffer && !t.isParsing) : null
      if (unparsed) {
        setTabs(prev => prev.map(t => t.id === unparsed.id ? { ...t, isParsing: true } : t))
        setLoading(true)
        setError('')
        try {
          const buffer = await unparsed.file.arrayBuffer()
          fileBuffersRef.current[unparsed.id] = buffer
          const data = await parsePptxForEditing(unparsed.file)
          
          setTabs(prev => prev.map(t => t.id === unparsed.id ? {
            ...t,
            filename: unparsed.file.name,
            title: unparsed.file.name,
            fileBuffer: buffer,
            parsedData: data,
            activeSlideIndex: 0,
            viewMode: 'quick',
            isParsing: false
          } : t))
        } catch (err) {
          console.error(err)
          setError(err.message || 'Failed to parse PPTX file structure.')
          setTabs(prev => prev.map(t => t.id === unparsed.id ? { ...t, isParsing: false, error: true } : t))
        } finally {
          setLoading(false)
        }
      }
    }
    parseNewTabs()
  }, [tabs, setTabs])

  const isTauriEnv = () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI_IPC__)

  const handleFileUpload = async (uploadedFile, fileHandle = null) => {
    if (!uploadedFile) return
    onOpenNew(uploadedFile)
  }

  const handleNativeOpen = async () => {
    if (isTauriEnv()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const nativePath = await invoke('pick_open_file')
        if (nativePath) {
          setLoading(true)
          const uint8Array = await invoke('read_binary_file', { path: nativePath })
          const fileName = nativePath.split(/[/\\]/).pop() || 'Presentation.pptx'
          const fileObj = new File([new Uint8Array(uint8Array)], fileName, {
            type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          })
          fileObj.nativeFilePath = nativePath
          handleFileUpload(fileObj)
        }
      } catch (err) {
        console.error('Tauri native open failed:', err)
        setError('Failed to open native file: ' + err.message)
      } finally {
        setLoading(false)
      }
      return
    }

    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: 'PowerPoint Presentation',
              accept: {
                'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
              },
            },
          ],
        })
        const selectedFile = await handle.getFile()
        handleFileUpload(selectedFile, handle)
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Native open failed:', err)
      }
    } else {
      document.getElementById('pptx-file-input-fallback')?.click()
    }
  }

  const handleSaveDirect = async () => {
    // If saving while in Canvas mode, flush canvas edits first
    if (viewMode === 'canvas' && fullCanvasRef.current?.getContent) {
      try {
        const contentBytes = await fullCanvasRef.current.getContent()
        if (contentBytes) {
          const newBuffer = contentBytes.buffer.slice(
            contentBytes.byteOffset,
            contentBytes.byteOffset + contentBytes.byteLength
          )
          fileBufferRef.current = newBuffer
          setFileBuffer(newBuffer)
        }
      } catch (err) {
        console.warn('Could not flush canvas before save:', err)
      }
    }

    const exportFile =
      file ||
      (fileBufferRef.current
        ? new File([fileBufferRef.current], parsedData?.filename || 'Presentation.pptx', {
            type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          })
        : null)

    if (!exportFile || !parsedData) return

    setIsExporting(true)
    try {
      if (isTauriEnv()) {
        const { invoke } = await import('@tauri-apps/api/core')
        let nativePath = activeTab?.nativeFilePath || file?.nativeFilePath

        if (!nativePath) {
          nativePath = await invoke('pick_save_file', {
            suggestedName: exportFile.name || 'Presentation.pptx'
          })
        }

        if (nativePath) {
          const res = await exportEditedPptx(exportFile, parsedData.slides, { download: false, saveAs: false })
          if (res?.blob) {
            const buffer = await res.blob.arrayBuffer()
            await invoke('write_binary_file', {
              path: nativePath,
              contents: Array.from(new Uint8Array(buffer)),
            })
            // Persist nativeFilePath on tab
            setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, nativeFilePath: nativePath } : t))
            showToast(`✓ Saved directly to "${nativePath}" on disk!`)
          }
        }
        return
      }

      const res = await exportEditedPptx(exportFile, parsedData.slides, {
        fileHandle: fileHandleRef.current,
        saveAs: false,
        download: !fileHandleRef.current,
        outputFileName: exportFile.name,
      })
      if (res?.savedDirectly) {
        showToast(`✓ Saved directly to "${res.fileName}" on disk!`)
      } else {
        showToast(`✓ Exported "${exportFile.name}"!`)
      }
    } catch (err) {
      console.error('Save error:', err)
      alert('Error saving PPTX: ' + err.message)
    } finally {
      setIsExporting(false)
    }
  }

  const handleSaveAs = async () => {
    if (viewMode === 'canvas' && fullCanvasRef.current?.getContent) {
      try {
        const contentBytes = await fullCanvasRef.current.getContent()
        if (contentBytes) {
          const newBuffer = contentBytes.buffer.slice(
            contentBytes.byteOffset,
            contentBytes.byteOffset + contentBytes.byteLength
          )
          fileBufferRef.current = newBuffer
          setFileBuffer(newBuffer)
        }
      } catch (err) {
        console.warn('Could not flush canvas before save as:', err)
      }
    }

    const exportFile =
      file ||
      (fileBufferRef.current
        ? new File([fileBufferRef.current], parsedData?.filename || 'Presentation.pptx', {
            type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          })
        : null)

    if (!exportFile || !parsedData) return

    setIsExporting(true)
    try {
      if (isTauriEnv()) {
        const { invoke } = await import('@tauri-apps/api/core')
        const nativePath = await invoke('pick_save_file', {
          suggestedName: exportFile.name || 'Presentation.pptx'
        })
        if (nativePath) {
          const res = await exportEditedPptx(exportFile, parsedData.slides, { download: false, saveAs: false })
          if (res?.blob) {
            const buffer = await res.blob.arrayBuffer()
            await invoke('write_binary_file', {
              path: nativePath,
              contents: Array.from(new Uint8Array(buffer)),
            })
            setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, nativeFilePath: nativePath } : t))
            showToast(`✓ Saved to "${nativePath}" on disk!`)
          }
        }
        return
      }

      const res = await exportEditedPptx(exportFile, parsedData.slides, {
        saveAs: true,
        download: false,
        outputFileName: exportFile.name,
      })
      if (res?.savedDirectly) {
        if (res.fileHandle) fileHandleRef.current = res.fileHandle
        showToast(`✓ Saved to "${res.fileName}"!`)
      }
    } catch (err) {
      console.error('Save As error:', err)
      alert('Error saving PPTX: ' + err.message)
    } finally {
      setIsExporting(false)
    }
  }

  // Keyboard shortcut listener (Ctrl+S / Cmd+S) for 1-click direct file save
  useEffect(() => {
    const handleSaveShortcut = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSaveDirect()
      }
    }
    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  }, [activeTabId, viewMode, parsedData, file])

  const handleExport = async () => {
    const exportFile =
      file ||
      (fileBufferRef.current
        ? new File([fileBufferRef.current], parsedData?.filename || 'Presentation.pptx', {
            type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          })
        : null)

    if (!exportFile || !parsedData) {
      alert('No presentation loaded to export.')
      return
    }

    setIsExporting(true)
    try {
      await exportEditedPptx(exportFile, parsedData.slides, `Edited_${exportFile.name}`)
    } catch (err) {
      console.error('Export error:', err)
      alert('Error exporting PPTX: ' + err.message)
    } finally {
      setIsExporting(false)
    }
  }

  const handleUploadDrop = (e) => {
    e.preventDefault()
    setIsDraggingUpload(false)
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      handleFileUpload(droppedFile)
    }
  }

  const handleInstallApp = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      deferredPrompt.userChoice.then(() => setDeferredPrompt(null))
    }
  }

  const updateElement = (elemId, updates) => {
    setParsedData((prev) => {
      if (!prev) return prev
      const newSlides = [...prev.slides]
      const slide = { ...newSlides[activeSlideIndex] }
      slide.elements = slide.elements.map((elem) => {
        if (elem.id === elemId) return { ...elem, ...updates }
        return elem
      })
      newSlides[activeSlideIndex] = slide
      return { ...prev, slides: newSlides }
    })
  }

  const handleElementImageDrop = async (e, elemId) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverElemId(null)

    const dataUrl = await getDroppedImageAsDataUrl(e)
    if (dataUrl) {
      updateElement(elemId, { dataUrl })
    }
  }

  const triggerImageReplacement = (elemId) => {
    setReplacingElemId(elemId)
    if (imageInputRef.current) {
      imageInputRef.current.value = ''
      imageInputRef.current.click()
    }
  }

  const handleImageFileChange = (e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile || !replacingElemId) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      updateElement(replacingElemId, { dataUrl: evt.target.result })
      setReplacingElemId(null)
    }
    reader.readAsDataURL(selectedFile)
  }

  const handleTableCellChange = (elemId, rowIndex, colIndex, newText) => {
    setParsedData((prev) => {
      if (!prev) return prev
      const newSlides = [...prev.slides]
      const slide = { ...newSlides[activeSlideIndex] }
      slide.elements = slide.elements.map((elem) => {
        if (elem.id === elemId && elem.type === 'table') {
          const newRows = elem.rows.map((row, rIdx) => {
            if (rIdx === rowIndex) {
              return row.map((cell, cIdx) => (cIdx === colIndex ? { ...cell, text: newText } : cell))
            }
            return row
          })
          return { ...elem, rows: newRows }
        }
        return elem
      })
      newSlides[activeSlideIndex] = slide
      return { ...prev, slides: newSlides }
    })
  }

  const handleAddSlide = () => {
    if (!parsedData) return
    const newSlideNum = parsedData.slides.length + 1
    const newSlide = {
      id: `slide_${newSlideNum}_${Date.now()}`,
      slideNumber: newSlideNum,
      title: `Slide ${newSlideNum}`,
      xmlPath: `ppt/slides/slide${newSlideNum}.xml`,
      relsPath: `ppt/slides/_rels/slide${newSlideNum}.xml.rels`,
      elements: [
        {
          id: `slide_${newSlideNum}_title_${Date.now()}`,
          type: 'text',
          tagName: '<p:sp> Title',
          text: `Slide ${newSlideNum} Title`,
          originalText: '',
          fontFace: 'Calibri',
          fontSizePct: 3.5,
          bold: true,
          color: '111111',
          align: 'center',
          isTitle: true,
          xPct: 10,
          yPct: 10,
          wPct: 80,
          hPct: 15,
          xEmu: 1219200,
          yEmu: 685800,
        },
      ],
      backgroundDataUrl: '',
      rawXml: '',
    }
    setParsedData((prev) => {
      const slides = [...prev.slides, newSlide]
      return { ...prev, slides }
    })
    setActiveSlideIndex(parsedData.slides.length)
  }

  const moveSlide = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= parsedData.slides.length) return
    setParsedData((prev) => {
      const slides = [...prev.slides]
      const [moved] = slides.splice(fromIndex, 1)
      slides.splice(toIndex, 0, moved)
      const renumbered = slides.map((s, idx) => ({ ...s, slideNumber: idx + 1 }))
      return { ...prev, slides: renumbered }
    })
    setActiveSlideIndex(toIndex)
  }

  const duplicateSlide = (index) => {
    setParsedData((prev) => {
      const slides = [...prev.slides]
      const orig = slides[index]
      const copy = {
        ...orig,
        id: `slide_${Date.now()}_copy`,
        slideNumber: index + 2,
        title: `${orig.title} (Copy)`,
        elements: orig.elements.map((e) => ({ ...e, id: `${e.id}_copy_${Date.now()}` })),
      }
      slides.splice(index + 1, 0, copy)
      const renumbered = slides.map((s, idx) => ({ ...s, slideNumber: idx + 1 }))
      return { ...prev, slides: renumbered }
    })
    setActiveSlideIndex(index + 1)
  }

  const deleteSlide = (index) => {
    if (parsedData.slides.length <= 1) {
      alert('Cannot delete the last slide in the presentation.')
      return
    }
    setParsedData((prev) => {
      const slides = prev.slides.filter((_, i) => i !== index)
      const renumbered = slides.map((s, idx) => ({ ...s, slideNumber: idx + 1 }))
      return { ...prev, slides: renumbered }
    })
    setActiveSlideIndex((prev) => Math.max(0, Math.min(prev, parsedData.slides.length - 2)))
  }

  const deleteSelectedElement = () => {
    if (!selectedElementId || !parsedData?.slides?.[activeSlideIndex]) return
    setParsedData((prev) => {
      const newSlides = [...prev.slides]
      const slide = { ...newSlides[activeSlideIndex] }
      slide.elements = slide.elements.filter((e) => e.id !== selectedElementId)
      newSlides[activeSlideIndex] = slide
      return { ...prev, slides: newSlides }
    })
    setSelectedElementId(null)
  }

  return (
    <div className="pptx-studio">
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageFileChange}
        accept="image/png, image/jpeg, image/webp, image/gif, image/svg+xml"
        style={{ display: 'none' }}
      />

      {/* ── Header Ribbon Bar ── */}
      <header className="pptx-ribbon">
        <div className="pptx-ribbon__brand">
          <div className="pptx-ribbon__logo">📊</div>
          <div>
            <h1 className="pptx-ribbon__title">PowerPoint Studio Editor</h1>
            <span className="pptx-ribbon__subtitle">
              {tabs.length > 0 ? `${tabs.length} Presentation(s) open` : 'No presentation loaded'}
            </span>
          </div>
        </div>

        {parsedData && (
          <div className="pptx-ribbon__actions">
            {/* ── Mode Switcher Segmented Control ── */}
            <div className="pptx-mode-switcher" style={{ display: 'flex', background: '#1e293b', padding: '3px', borderRadius: '8px', gap: '2px' }}>
              <button
                type="button"
                className={`pptx-mode-btn${viewMode === 'quick' ? ' is-active' : ''}`}
                onClick={() => handleModeChange('quick')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: viewMode === 'quick' ? '#3b82f6' : 'transparent',
                  color: viewMode === 'quick' ? '#ffffff' : '#94a3b8',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                ⚡ Quick Edit
              </button>
              <button
                type="button"
                className={`pptx-mode-btn${viewMode === 'canvas' ? ' is-active' : ''}`}
                onClick={() => handleModeChange('canvas')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: viewMode === 'canvas' ? '#6366f1' : 'transparent',
                  color: viewMode === 'canvas' ? '#ffffff' : '#94a3b8',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                🎨 Full Editor
              </button>
            </div>

            <div className="pptx-ribbon__divider" />

            <div className="pptx-ribbon__group">
              <button
                type="button"
                className="pptx-ribbon__btn pptx-ribbon__btn--ghost"
                onClick={handleNativeOpen}
              >
                <span className="pptx-ribbon__icon">📂</span>
                <span>Open PPTX</span>
              </button>

              <button
                type="button"
                className="pptx-ribbon__btn pptx-ribbon__btn--primary"
                onClick={handleSaveDirect}
                disabled={isExporting}
                title="Save directly to original file on disk"
              >
                <span className="pptx-ribbon__icon">{isExporting ? '⏳' : '💾'}</span>
                <span>{isExporting ? 'Saving...' : 'Save File'}</span>
              </button>

              <button
                type="button"
                className="pptx-ribbon__btn pptx-ribbon__btn--ghost"
                onClick={handleSaveAs}
                disabled={isExporting}
              >
                <span className="pptx-ribbon__icon">💾</span>
                <span>Save As...</span>
              </button>

              <button
                type="button"
                className="pptx-ribbon__btn pptx-ribbon__btn--ghost"
                onClick={handleExport}
                disabled={isExporting}
              >
                <span className="pptx-ribbon__icon">⬇️</span>
                <span>Download Copy</span>
              </button>

              {deferredPrompt && (
                <button
                  type="button"
                  className="pptx-ribbon__btn pptx-ribbon__btn--primary"
                  onClick={handleInstallApp}
                >
                  <span className="pptx-ribbon__icon">💻</span>
                  <span>Install App</span>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Removed Internal Tab Bar */}

      {/* Toast Save Banner */}
      {toastMessage && (
        <div className="pptx-editor__toast">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="pptx-editor__alert pptx-editor__alert--error">
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* Upload View */}
      {!activeTab?.parsedData && !loading && (
        <div className="pptx-editor__upload-wrapper">
          <div
            className={`pptx-editor__dropzone${isDraggingUpload ? ' is-dragging' : ''}`}
            onDrop={handleUploadDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingUpload(true) }}
            onDragLeave={() => setIsDraggingUpload(false)}
          >
            <div className="pptx-editor__dropzone-icon">📊</div>
            <h3>Drag & Drop your PowerPoint (.pptx) file here</h3>
            <p>Dual-mode presentation editor with Quick Tag Edit & Full Visual Canvas</p>

            <button type="button" className="pptx-editor__upload-btn" onClick={handleNativeOpen}>
              <span>Choose PPTX File</span>
            </button>
            <input
              id="pptx-file-input-fallback"
              type="file"
              accept=".pptx"
              style={{ display: 'none' }}
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
            />
          </div>
        </div>
      )}

      {/* Loading Spinner */}
      {loading && (
        <div className="pptx-editor__loading">
          <div className="pptx-editor__spinner" />
          <p>Processing presentation buffer and updating views...</p>
        </div>
      )}

      {/* Main Studio Workbench */}
      {!loading && activeTab?.parsedData && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {viewMode === 'quick' ? (
            <QuickEditView
              parsedData={parsedData}
              setParsedData={setParsedData}
              activeSlideIndex={activeSlideIndex}
              setActiveSlideIndex={setActiveSlideIndex}
              selectedElementId={selectedElementId}
              setSelectedElementId={setSelectedElementId}
              dragOverElemId={dragOverElemId}
              setDragOverElemId={setDragOverElemId}
              updateElement={updateElement}
              handleElementImageDrop={handleElementImageDrop}
              triggerImageReplacement={triggerImageReplacement}
              handleTableCellChange={handleTableCellChange}
              handleAddSlide={handleAddSlide}
              moveSlide={moveSlide}
              duplicateSlide={duplicateSlide}
              deleteSlide={deleteSlide}
              deleteSelectedElement={deleteSelectedElement}
            />
          ) : (
            <FullCanvasEditor
              ref={fullCanvasRef}
              fileBuffer={fileBuffer}
              fileName={file?.name || parsedData.filename}
              onContentChange={(newContent) => {
                fileBufferRef.current = newContent.buffer
                setFileBuffer(newContent.buffer)
              }}
              showToast={showToast}
            />
          )}
        </div>
      )}
    </div>
  )
}
