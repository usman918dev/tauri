import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { loadPptxEditorState } from './utils/storage';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { HomeTab } from './HomeTab';
import { PptxWorkspace as PptxEditorWorkspace } from './PptxWorkspace'; // Note: Renamed to avoid collision with lazy PptxEditor
import Navbar from './Navbar'
import { ImportedSlideEditor } from './ImportedSlideEditor'
import { SlideCanvas } from './components/SlideCanvas'
import { PairCard } from './components/PairCard'
import { ReportHeader } from './components/ReportHeader'
import { ROUTES, normalizeRoute } from './config/routes'
import { TEMPLATES, getTemplateForPath, DESILTING_PRESET_TEXT } from './config/templates'
import { checkAppUpdates } from './utils/updater'
import {
  buildStorageKey,
  canUseStorage,
  loadPairsFromDb,
  savePairsToDb,
  removePairsFromDb,
  loadStoredPairsSync,
  loadStoredPairs,
  savePairsToStorage,
  loadMasterPresets,
  saveMasterPresets,
  loadActivePresetId,
  saveActivePresetId,
  migrateLegacyLayout,
} from './utils/storage'
import {
  buildEmptyPair,
  resolvePairsSource,
  isPairComplete,
  getMovableCount,
  normalizePairs,
  hasPairContent,
  trimTrailingEmptyPairs,
} from './utils/pairUtils'

const MasterDesigner = lazy(() =>
  import('./MasterDesigner').then((module) => ({
    default: module.MasterDesigner,
  })),
)
const ImageExtractor = lazy(() =>
  import('./ImageExtractor').then((module) => ({
    default: module.ImageExtractor,
  })),
)
const PptxMerger = lazy(() =>
  import('./PptxMerger').then((module) => ({
    default: module.PptxMerger,
  })),
)
const PdfToPptx = lazy(() =>
  import('./PdfToPptx').then((module) => ({
    default: module.PdfToPptx,
  })),
)
const PdfMerger = lazy(() =>
  import('./PdfMerger').then((module) => ({
    default: module.PdfMerger,
  })),
)
const CollageMaker = lazy(() =>
  import('./CollageMaker').then((module) => ({
    default: module.CollageMaker,
  })),
)
const PptxToPdfOcr = lazy(() =>
  import('./PptxToPdfOcr').then((module) => ({
    default: module.PptxToPdfOcr,
  })),
)
const PptxToPdf = lazy(() =>
  import('./PptxToPdf').then((module) => ({
    default: module.PptxToPdf,
  })),
)
const PptxEditor = lazy(() =>
  import('./PptxEditor').then((module) => ({
    default: module.PptxEditor,
  })),
)

const loadGenerateReportModule = () => import('./report/generateReport')
const loadImportPptxModule = () => import('./report/importPptx')
const loadJsZip = () => import('jszip').then((module) => module.default)

function App({ data }) {
  const [tabs, setTabs] = useState([{ id: 'home', type: 'home', title: 'Home' }])
  const [activeTabId, setActiveTabId] = useState('home')
  const [isGlobalTabsHydrated, setIsGlobalTabsHydrated] = useState(false)

  // Reveal Tauri main window smoothly once React and initial DOM have mounted
  useEffect(() => {
    if (typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI_IPC__)) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().show()
      }).catch((err) => {
        console.warn('Could not show Tauri window:', err)
      })
    }
  }, [])

  useEffect(() => {
    const handleGlobalDragOver = (e) => {
      e.preventDefault()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
    }
    const handleGlobalDrop = (e) => {
      e.preventDefault()
    }
    window.addEventListener('dragover', handleGlobalDragOver, false)
    window.addEventListener('drop', handleGlobalDrop, false)
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver, false)
      window.removeEventListener('drop', handleGlobalDrop, false)
    }
  }, [])

  // ── Unsaved-changes close guards ──────────────────────────────────────────
  // Use a ref so event listeners always read the latest tabs without re-registering.
  const tabsRef = useRef(tabs)
  useEffect(() => { tabsRef.current = tabs }, [tabs])

  // Browser tab / window refresh guard (web)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      const hasDirty = tabsRef.current.some(t => t.isDirty)
      if (hasDirty) {
        e.preventDefault()
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Tauri native window X-button close guard
  useEffect(() => {
    let unlisten = null
    const setupTauriCloseGuard = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()
        unlisten = await win.onCloseRequested(async (event) => {
          const dirtyTabs = tabsRef.current.filter(t => t.isDirty)
          if (dirtyTabs.length > 0) {
            event.preventDefault()
            const names = dirtyTabs.map(t => `• ${t.title || t.filename || 'Untitled'}`).join('\n')
            const shouldClose = window.confirm(
              `You have unsaved changes in ${dirtyTabs.length} tab${dirtyTabs.length > 1 ? 's' : ''}:\n${names}\n\nClose anyway? All unsaved changes will be lost.`
            )
            if (shouldClose) {
              await win.destroy()
            }
          }
        })
      } catch {
        // Not in Tauri environment, ignore
      }
    }
    setupTauriCloseGuard()
    return () => { unlisten?.() }
  }, [])


  useEffect(() => {
    const hydrate = async () => {
      try {
        const saved = await loadPptxEditorState()
        if (saved && saved.tabs && saved.tabs.length > 0) {
          const restoredTabs = saved.tabs
            .filter(t => t && t.id !== 'home' && (t.title || t.filename))
            .map(t => ({
              id: t.id,
              type: t.type || (t.fileBuffer ? 'document' : 'tool'),
              toolId: t.toolId || t.id,
              title: t.title || t.filename || 'Tool',
              route: t.route || '/',
              presetId: t.presetId || null,
              designerMode: t.designerMode || (t.presetId ? 'use' : 'design'),
              file: t.file || null,
              nativeFilePath: t.nativeFilePath || null,
              fileBuffer: t.fileBuffer || null,
              parsedData: t.parsedData || null,
              activeSlideIndex: t.activeSlideIndex || 0,
              viewMode: t.viewMode || 'quick',
            }))
          if (restoredTabs.length > 0) {
            setTabs([{ id: 'home', type: 'home', title: 'Home' }, ...restoredTabs])
            if (saved.activeTabId && (saved.activeTabId === 'home' || restoredTabs.some(t => t.id === saved.activeTabId))) {
              setActiveTabId(saved.activeTabId)
            }
          }
        }
      } catch (err) {
        console.warn('Failed to restore PPTX Editor state:', err)
      } finally {
        setIsGlobalTabsHydrated(true)
      }
    }
    hydrate()
  }, [])

  useEffect(() => {
    if (!isGlobalTabsHydrated) return
    // Debounce: wait 600ms after the last change before writing to storage.
    // This prevents hammering IndexedDB/Tauri on every rapid state update
    // (slide index changes, parse flags, etc.)
    const timer = setTimeout(() => {
      import('./utils/storage').then(({ savePptxEditorState }) => {
        savePptxEditorState({
          activeTabId,
          tabs: tabs.filter(t => t && t.id !== 'home' && (t.title || t.filename)).map(t => {
            // Strip image dataUrls from parsedData elements before storage.
            // They can be MBs of base64 — the fileBuffer is stored anyway so
            // parsedData can be re-parsed on restore. We keep structural metadata.
            let parsedDataToStore = t.parsedData
            if (parsedDataToStore?.slides) {
              parsedDataToStore = {
                ...parsedDataToStore,
                slides: parsedDataToStore.slides.map(slide => ({
                  ...slide,
                  backgroundDataUrl: '', // strip large bg image
                  elements: (slide.elements || []).map(el =>
                    el.type === 'image'
                      ? { ...el, dataUrl: '', originalDataUrl: '' }
                      : el
                  ),
                })),
              }
            }
            return {
              id: t.id,
              type: t.type,
              toolId: t.toolId,
              title: t.title || t.filename,
              route: t.route,
              presetId: t.presetId,
              designerMode: t.designerMode,
              filename: t.filename || t.file?.name,
              nativeFilePath: t.nativeFilePath || t.file?.nativeFilePath || null,
              fileBuffer: t.fileBuffer,
              parsedData: parsedDataToStore,
              activeSlideIndex: t.activeSlideIndex,
              viewMode: t.viewMode,
            }
          })
        })
      })
    }, 600)
    return () => clearTimeout(timer)
  }, [tabs, activeTabId, isGlobalTabsHydrated])

  const openToolTab = (tool) => {
    if (tool.toolId === 'master' || tool.id === 'master-designer' || tool.presetId) {
      const presetIdToMatch = tool.presetId || activePresetId
      const existing = tabs.find(t => t.type === 'tool' && t.presetId === presetIdToMatch)
      if (existing) {
        if (tool.designerMode) {
          setTabs(prev => prev.map(t => t.id === existing.id ? { ...t, designerMode: tool.designerMode } : t))
        }
        setActiveTabId(existing.id)
        return
      }
      const presetObj = masterPresets.find(p => p.id === tool.presetId)
      const tabTitle = presetObj ? presetObj.name : (tool.name || tool.title || 'Master Creator')
      const newTab = {
        id: `tab_master_${tool.presetId || Date.now()}`,
        type: 'tool',
        toolId: 'master',
        title: tabTitle,
        route: ROUTES.master,
        presetId: tool.presetId || activePresetId,
        designerMode: tool.designerMode || (tool.presetId ? 'use' : 'design'),
      }
      setTabs(prev => [...prev, newTab])
      setActiveTabId(newTab.id)
      return
    }

    const existing = tabs.find(t => t.type === 'tool' && t.toolId === tool.id)
    if (existing) {
      setActiveTabId(existing.id)
      return
    }
    const newTab = { id: `tab_${Date.now()}`, type: 'tool', toolId: tool.id, title: tool.name || tool.title, route: tool.route }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  const openDocumentTab = (file, nativePath = null, fileHandle = null) => {
    const filePath = nativePath || file?.nativeFilePath || null
    const handle = fileHandle || file?.fileHandle || null
    const newTab = {
      id: `doc_${Date.now()}`,
      type: 'document',
      title: file.name,
      file,
      nativeFilePath: filePath,
      fileHandle: handle
    }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  const closeTab = (id) => {
    if (id === 'home') return
    const tabToClose = tabs.find(t => t.id === id)
    if (tabToClose?.isDirty) {
      const shouldClose = window.confirm(
        `"${tabToClose.title || 'This tab'}" has unsaved changes.\n\nClose anyway? All unsaved changes will be lost.`
      )
      if (!shouldClose) return
    }
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (activeTabId === id) {
        const idx = prev.findIndex(t => t.id === id)
        setActiveTabId(next[Math.max(0, idx - 1)].id)
      }
      return next
    })
  }

  // Mark a specific tab as dirty (unsaved changes) or clean
  const setTabDirty = (tabId, dirty) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isDirty: dirty } : t))
  }

  const activeTab = tabs.find(t => t.id === activeTabId)
  const currentRoute = activeTab?.route || ROUTES.clean

  // ── Preset management state ─────────────────────────────────────────────
  const [masterPresets, setMasterPresets] = useState([])
  const [activePresetId, setActivePresetId] = useState(null)
  const [designerMode, setDesignerMode] = useState('design')

  // Derive presetId and designerMode per active tab (fallback to global)
  const effectivePresetId = activeTab?.presetId || activePresetId
  const effectiveDesignerMode = activeTab?.designerMode || designerMode

  const setEffectiveDesignerMode = (mode) => {
    setDesignerMode(mode)
    if (activeTabId && activeTabId !== 'home') {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, designerMode: mode } : t))
    }
  }

  const setEffectivePresetId = async (presetId) => {
    setActivePresetId(presetId)
    await saveActivePresetId(presetId)
    if (activeTabId && activeTabId !== 'home') {
      const preset = masterPresets.find(p => p.id === presetId)
      const presetName = preset ? preset.name : 'Master Creator'
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, presetId, title: presetName } : t))
    }
    const first = await loadPairsFromDb(`pptxpro:custom-first-slide-data:${presetId}`)
    const last = await loadPairsFromDb(`pptxpro:custom-last-slide-data:${presetId}`)
    setFirstSlideData(first || {})
    setLastSlideData(last || {})
  }

  // Derive customLayout from effective preset
  const customLayout = masterPresets.find((p) => p.id === effectivePresetId)?.layout || null
  const [firstSlideData, setFirstSlideData] = useState({})
  const [lastSlideData, setLastSlideData] = useState({})
  const [isHydrated, setIsHydrated] = useState(false)

  // ── Imported first/last slide state (master route only) ─────────────────
  const [importedFirstSlide, setImportedFirstSlide] = useState(null)
  const [importedLastSlide, setImportedLastSlide] = useState(null)
  const [useTemplateFirst, setUseTemplateFirst] = useState(false)
  const [useTemplateLast, setUseTemplateLast] = useState(false)
  // Refs hold the latest edited data so canvas render can access it without stale closures
  const importedFirstSlideRef = useRef(null)
  const importedLastSlideRef = useRef(null)

  useEffect(() => {
    const loadCustomData = async () => {
      try {
        // Load presets
        let presets = await loadMasterPresets()

        // Migrate old single layout key if needed
        if (presets.length === 0) {
          const migrated = await migrateLegacyLayout(presets)
          if (migrated) {
            presets = migrated
            await saveMasterPresets(presets)
          }
        } else {
          const migrated = await migrateLegacyLayout(presets)
          if (migrated) {
            presets = migrated
            await saveMasterPresets(presets)
          }
        }

        setMasterPresets(presets)

        // Load active preset id
        let activeId = await loadActivePresetId()
        if (!activeId && presets.length > 0) {
          activeId = presets[0].id
          await saveActivePresetId(activeId)
        }
        setActivePresetId(activeId)

        // Switch to Use mode if a preset has placeholders
        const active = presets.find((p) => p.id === activeId)
        if (active?.layout?.placeholders?.length) {
          setDesignerMode('use')
        }

        // Load first/last slide data (scoped to the active preset)
        if (activeId) {
          const first = await loadPairsFromDb(`pptxpro:custom-first-slide-data:${activeId}`)
          const last = await loadPairsFromDb(`pptxpro:custom-last-slide-data:${activeId}`)
          if (first) setFirstSlideData(first)
          if (last) setLastSlideData(last)
        }
      } catch (err) {
        console.error('Failed to load master preset data from storage', err)
      }
      void checkAppUpdates()
    }
    loadCustomData()
  }, [])

  // ── Preset action handlers ───────────────────────────────────────────────
  const handleSaveNewPreset = async (name, layout) => {
    const newPreset = {
      id: `preset_${Date.now()}`,
      name,
      createdAt: Date.now(),
      layout,
    }
    const updated = [...masterPresets, newPreset]
    setMasterPresets(updated)
    setActivePresetId(newPreset.id)
    await saveMasterPresets(updated)
    await saveActivePresetId(newPreset.id)
    setDesignerMode('design')
    alert(`Preset "${name}" saved! Switch to "Use Template" to use it.`)
  }

  const handleLoadPreset = async (id) => {
    setActivePresetId(id)
    await saveActivePresetId(id)
    const first = await loadPairsFromDb(`pptxpro:custom-first-slide-data:${id}`)
    const last = await loadPairsFromDb(`pptxpro:custom-last-slide-data:${id}`)
    setFirstSlideData(first || {})
    setLastSlideData(last || {})
  }

  const handleDeletePreset = async (id) => {
    const updated = masterPresets.filter((p) => p.id !== id)
    setMasterPresets(updated)
    await saveMasterPresets(updated)
    if (activePresetId === id) {
      const newActive = updated[0]?.id || null
      setActivePresetId(newActive)
      await saveActivePresetId(newActive)
    }
  }

  // ── Export / Import handlers ────────────────────────────────────────────
  const handleExportPreset = (id) => {
    const preset = masterPresets.find((p) => p.id === id)
    if (!preset) return
    const blob = new Blob([JSON.stringify([preset], null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${preset.name.replace(/[^a-z0-9_-]/gi, '_')}.pptxpro-template.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportAllPresets = () => {
    if (masterPresets.length === 0) {
      alert('No templates to export.')
      return
    }
    const blob = new Blob([JSON.stringify(masterPresets, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'all-templates.pptxpro-template.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportPresetsFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target.result
        let parsed
        try {
          parsed = JSON.parse(text)
        } catch {
          alert('❌ Invalid file — could not parse JSON. Make sure you are importing a valid .pptxpro-template.json file.')
          return
        }

        const incoming = Array.isArray(parsed) ? parsed : (parsed && parsed.id ? [parsed] : [])
        if (incoming.length === 0) {
          alert('❌ No templates found in the file.')
          return
        }

        const valid = incoming.filter((p) => p && typeof p === 'object' && p.layout)
        if (valid.length === 0) {
          alert('❌ The file does not contain valid template data. Each template must have a "layout" field.')
          return
        }

        const sanitized = valid.map((p) => ({
          ...p,
          id: typeof p.id === 'string' && p.id ? p.id : `preset_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: typeof p.name === 'string' && p.name ? p.name : 'Imported Template',
          createdAt: p.createdAt || Date.now(),
        }))

        const existingIds = new Set(masterPresets.map((p) => p.id))
        const toAdd = sanitized.map((p) => {
          if (existingIds.has(p.id)) {
            return {
              ...p,
              id: `preset_imported_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              name: `${p.name} (imported)`,
            }
          }
          return p
        })

        const updated = [...masterPresets, ...toAdd]
        setMasterPresets(updated)
        await saveMasterPresets(updated)

        if (!activePresetId && toAdd.length > 0) {
          setActivePresetId(toAdd[0].id)
          await saveActivePresetId(toAdd[0].id)
        }

        alert(`✅ Imported ${toAdd.length} template${toAdd.length !== 1 ? 's' : ''} successfully! ${toAdd.length === 1 ? `"${toAdd[0].name}"` : ''} is now in your library.`)
      } catch (err) {
        alert(`❌ Import failed: ${err.message}`)
      }
    }
    reader.onerror = () => {
      alert('❌ Could not read the file. Please try again.')
    }
    reader.readAsText(file)
  }

  const handleRenamePreset = async (id, newName) => {
    const updated = masterPresets.map((p) => (p.id === id ? { ...p, name: newName } : p))
    setMasterPresets(updated)
    await saveMasterPresets(updated)
  }

  const template = useMemo(() => {
    if (currentRoute === ROUTES.gpsPdf) {
      return {
        eyebrow: 'PPTXPro',
        title: 'PPTX to PDF (OCR Studio)',
        subtext: 'Upload any PPTX presentation or PDF document. Scans custom slide/page height from bottom for GPS coordinates or embeds a searchable/selectable text layer.',
        masterBgUrl: '',
        slots: [],
        themeLabel: '',
      }
    }
    if (currentRoute === ROUTES.pptxToPdf) {
      return {
        eyebrow: 'PPTXPro',
        title: 'PPTX to PDF Converter',
        subtext: 'Upload a PPTX presentation and convert every slide into a high-quality PDF document. Select slides, reorder pages, and download instantly.',
        masterBgUrl: '',
        slots: [],
        themeLabel: '',
      }
    }
    if (currentRoute === ROUTES.collage) {
      return {
        eyebrow: 'PPTXPro',
        title: 'Collage Maker',
        subtext: 'Upload images in bulk, arrange them in a 2x3 or 3x3 grid, adjust margins, and export to PPTX or ZIP.',
        masterBgUrl: '',
        slots: [],
        themeLabel: '',
      }
    }
    if (currentRoute === ROUTES.mergePdf) {
      return {
        eyebrow: 'PPTXPro',
        title: 'Merge PDF Documents',
        subtext: 'Upload multiple PDF files to combine them into a single PDF document and check total page count.',
        masterBgUrl: '',
        slots: [],
        themeLabel: '',
      }
    }
    if (currentRoute === ROUTES.pdf) {
      return {
        eyebrow: 'PPTXPro',
        title: 'PDF to PPTX Converter',
        subtext: 'Upload a PDF file to convert its pages into PowerPoint slides. Reorder, exclude, and download them.',
        masterBgUrl: '',
        slots: [],
        themeLabel: '',
      }
    }
    if (currentRoute === ROUTES.extract) {
      return {
        eyebrow: 'PPTXPro',
        title: 'Image Extractor',
        subtext: 'Upload any PPTX to extract every image from every slide. Review, reorder, and export them as individual slides.',
        masterBgUrl: '',
        slots: [],
        themeLabel: '',
      }
    }
    if (currentRoute === ROUTES.merge) {
      return {
        eyebrow: 'PPTXPro',
        title: 'Merge Presentations',
        subtext: 'Upload multiple PPTX files to merge their slides in sequential order.',
        masterBgUrl: '',
        slots: [],
        themeLabel: '',
      }
    }
    if (currentRoute === ROUTES.master) {
      return {
        eyebrow: 'Custom Master',
        title: 'Custom Template Report',
        subtext: 'Upload images to automatically generate slides and compile PPTX reports.',
        masterBgUrl: customLayout?.masterBgUrl || '',
        firstSlideUrl: customLayout?.firstSlideUrl || '',
        secondSlideUrl: '',
        lastSlideUrl: customLayout?.lastSlideUrl || '',
        fileNamePrefix: masterPresets.find((p) => p.id === effectivePresetId)?.name || 'Custom_Report',
        masterTitle: 'CUSTOM_MASTER',
        slideTitle: 'Custom Report',
        themeLabel: 'Custom template slide background',
        importSkipFirst: 1,
        importSkipLast: 1,
        imageCount: customLayout?.placeholders?.length || 0,
        slots: (customLayout?.placeholders || []).map((p) => ({
          key: p.key,
          label: p.label,
          className: 'slide-slot',
          style: {
            left: `${(p.x / 13.333) * 100}%`,
            top: `${(p.y / 7.5) * 100}%`,
            width: `${(p.w / 13.333) * 100}%`,
            height: `${(p.h / 7.5) * 100}%`,
            position: 'absolute',
            borderRadius: p.borderRadius ? `${p.borderRadius}px` : '0px',
          },
        })),
        textBoxes: customLayout?.textboxes || [],
      }
    }
    if (currentRoute === ROUTES.pptxEditor) {
      return {
        eyebrow: 'PPTXPro',
        title: 'PPTX Editor',
        subtext: 'Edit basic text & image tags preserving slide structure.',
        masterBgUrl: '',
        slots: [],
        themeLabel: '',
      }
    }
    return getTemplateForPath(currentRoute)
  }, [currentRoute, customLayout, masterPresets, effectivePresetId])

  const [dailyVariant, setDailyVariant] = useState('urban')
  const slotKeys = useMemo(() => {
    return template.slots?.length
      ? template.slots.map((slot) => slot.key)
      : ['beforeImage', 'afterImage']
  }, [template])
  const requiresText = Boolean(template.textBox)
  const textDefault = template.textDefault || ''
  const effectiveRouteKey =
    currentRoute === ROUTES.master && effectivePresetId
      ? `${currentRoute}:${effectivePresetId}`
      : currentRoute

  const storageKey =
    currentRoute === ROUTES.master && effectivePresetId
      ? `pptxpro:slides:v1:${currentRoute}:${effectivePresetId}`
      : buildStorageKey(
        currentRoute,
        currentRoute === ROUTES.dailyPlot ? dailyVariant : '',
      )

  useEffect(() => {
    if (currentRoute === ROUTES.master && effectivePresetId) {
      loadPairsFromDb(`pptxpro:custom-first-slide-data:${effectivePresetId}`).then((first) => {
        setFirstSlideData(first || {})
      })
      loadPairsFromDb(`pptxpro:custom-last-slide-data:${effectivePresetId}`).then((last) => {
        setLastSlideData(last || {})
      })
    }
  }, [currentRoute, effectivePresetId])
  // Track previous storageKey/slotKeys to reset hydration when route changes.
  // Using useRef + useEffect instead of setState-during-render (which is illegal in React).
  const prevKeyRef = useRef({ slotKeys, storageKey })
  useEffect(() => {
    if (slotKeys !== prevKeyRef.current.slotKeys || storageKey !== prevKeyRef.current.storageKey) {
      prevKeyRef.current = { slotKeys, storageKey }
      setIsHydrated(false)
    }
  }, [slotKeys, storageKey])

  const [pairs, setPairs] = useState(() => {
    const storedPairs = loadStoredPairsSync(storageKey)
    const source = resolvePairsSource({
      storedPairs,
      template,
      slotKeys,
      textDefault,
      requiresText,
    })
    return normalizePairs(source, { slotKeys, requiresText, textDefault })
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const routeFallback = <p className="app__note">Loading tool...</p>
  const [importStatus, setImportStatus] = useState({ type: 'idle', message: '' })
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [moveMenuIndex, setMoveMenuIndex] = useState(null)
  const pairRefs = useRef([])
  const pptxInputRef = useRef(null)
  const pendingScrollIndex = useRef(null)
  const moveMenuRef = useRef(null)
  const hydrationRef = useRef({ key: null, skipSave: false })

  useEffect(() => {
    if (
      !TEMPLATES[currentRoute] &&
      currentRoute !== ROUTES.master &&
      currentRoute !== ROUTES.extract &&
      currentRoute !== ROUTES.merge &&
      currentRoute !== ROUTES.pdf &&
      currentRoute !== ROUTES.mergePdf &&
      currentRoute !== ROUTES.collage &&
      currentRoute !== ROUTES.gpsPdf &&
      currentRoute !== ROUTES.pptxToPdf &&
      currentRoute !== ROUTES.pptxEditor
    ) {
      window.history.replaceState(null, '', ROUTES.clean)
    }
  }, [])

  useEffect(() => {
    if (currentRoute === ROUTES.dailyPlot) {
      setTimeout(() => setDailyVariant('urban'), 0)
    }
  }, [currentRoute])

  // --- FIXED USEEFFECT ---
  useEffect(() => {
    setTimeout(() => setIsHydrated(false), 0)
    let cancelled = false
    const hydrate = async () => {
      const storedPairs = await loadStoredPairs(storageKey)
      const storedFirst = await loadPairsFromDb(`${storageKey}:imported-first`)
      const storedLast = await loadPairsFromDb(`${storageKey}:imported-last`)
      const storedConfig = await loadPairsFromDb(`${storageKey}:imported-config`)

      const source = resolvePairsSource({
        storedPairs,
        template,
        slotKeys,
        textDefault,
        requiresText,
      })
      if (cancelled) {
        return
      }
      setPairs(normalizePairs(source, { slotKeys, requiresText, textDefault }))

      if (storedFirst) {
        setImportedFirstSlide(storedFirst)
        importedFirstSlideRef.current = storedFirst
      } else {
        setImportedFirstSlide(null)
        importedFirstSlideRef.current = null
      }

      if (storedLast) {
        setImportedLastSlide(storedLast)
        importedLastSlideRef.current = storedLast
      } else {
        setImportedLastSlide(null)
        importedLastSlideRef.current = null
      }

      if (storedConfig) {
        setUseTemplateFirst(!!storedConfig.useTemplateFirst)
        setUseTemplateLast(!!storedConfig.useTemplateLast)
      } else {
        setUseTemplateFirst(false)
        setUseTemplateLast(false)
      }

      hydrationRef.current = { key: storageKey, skipSave: true }
      setIsHydrated(true)
    }
    hydrate()

    return () => {
      cancelled = true
    }
  }, [storageKey, data, template, slotKeys, requiresText, textDefault])

  useEffect(() => {
    if (!isHydrated) {
      return
    }
    if (
      hydrationRef.current.key === storageKey &&
      hydrationRef.current.skipSave
    ) {
      hydrationRef.current.skipSave = false
      return
    }
    savePairsToStorage(storageKey, pairs, {
      slotKeys,
      requiresText,
      hasPairContent,
      trimTrailingEmptyPairs,
    })
  }, [pairs, storageKey, slotKeys, requiresText, isHydrated])

  useEffect(() => {
    const index = pendingScrollIndex.current
    if (index === null || index === undefined) {
      return
    }
    const target = pairRefs.current[index]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    pendingScrollIndex.current = null
  }, [pairs])

  useEffect(() => {
    if (moveMenuIndex === null) {
      return
    }
    const handleClick = (event) => {
      if (!moveMenuRef.current) {
        setMoveMenuIndex(null)
        return
      }
      if (!moveMenuRef.current.contains(event.target)) {
        setMoveMenuIndex(null)
      }
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [moveMenuIndex])

  const updatePair = (index, key, value) => {
    // Mark the active tab dirty whenever the user fills in any content
    setTabDirty(activeTabId, true)
    setPairs((prev) => {
      const next = prev.map((pair, pairIndex) =>
        pairIndex === index ? { ...pair, [key]: value } : pair,
      )

      const isComplete = isPairComplete(next[index], { slotKeys, requiresText })
      if (isComplete) {
        if (index === next.length - 1) {
          next.push(buildEmptyPair(slotKeys, textDefault))
          pendingScrollIndex.current = next.length - 1
        } else {
          pendingScrollIndex.current = index + 1
        }
      }
      return next
    })
  }

  const movePair = (fromIndex, toIndex) => {
    setPairs((prev) => {
      const next = [...prev]
      const lastIndex = next.length - 1
      const lastIsEmpty =
        lastIndex >= 0 &&
        !hasPairContent(next[lastIndex], { slotKeys, requiresText })
      const resolvedToIndex =
        lastIsEmpty && toIndex >= lastIndex ? lastIndex - 1 : toIndex
      if (
        fromIndex === resolvedToIndex ||
        resolvedToIndex < 0 ||
        resolvedToIndex >= next.length
      ) {
        return prev
      }
      const [moved] = next.splice(fromIndex, 1)
      next.splice(resolvedToIndex, 0, moved)
      return next
    })
  }

  const swapPairImages = (index) => {
    setPairs((prev) => {
      const next = prev.map((pair, pairIndex) => {
        if (pairIndex !== index) {
          return pair
        }
        return {
          ...pair,
          beforeImage: pair?.afterImage || '',
          afterImage: pair?.beforeImage || '',
        }
      })
      return next
    })
  }

  const handlePairDragStart = (event, index) => {
    setDragIndex(index)
    setMoveMenuIndex(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  const handlePairDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handlePairDragOver = (event, index) => {
    if (dragIndex === null || dragIndex === index) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handlePairDrop = (event, index) => {
    if (dragIndex === null) {
      return
    }
    event.preventDefault()
    movePair(dragIndex, index)
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const completePairs = pairs.filter((pair) =>
    isPairComplete(pair, { slotKeys, requiresText }),
  )
  const slideCount = completePairs.length
  const incompletePairCount = pairs.filter((pair) => {
    if (!hasPairContent(pair, { slotKeys, requiresText })) return false
    return !isPairComplete(pair, { slotKeys, requiresText })
  }).length
  const movableCount = getMovableCount(pairs, { slotKeys, requiresText })
  const canDownload = (slideCount > 0 || incompletePairCount > 0) && !isGenerating && !isImporting

  const handlePptxUpload = async (event, resolvedNativePath = null) => {
    const file = event.target.files?.[0]
    if (typeof event.target.value !== 'undefined') event.target.value = ''
    if (!file) {
      return
    }

    // Remember the on-disk path of the file being imported (for direct saves)
    if (resolvedNativePath) {
      setImportedPath(resolvedNativePath)
    }
    const hasExisting = pairs.some((pair) => {
      const hasImages = slotKeys.some((key) => pair?.[key])
      const hasText = requiresText
        ? typeof pair?.slideText === 'string' && pair.slideText.trim()
        : false
      return hasImages || hasText
    })
    if (hasExisting) {
      const confirmed = window.confirm(
        'Importing will replace the current slides. Continue?',
      )
      if (!confirmed) {
        return
      }
    }

    try {
      setIsImporting(true)
      setImportStatus({ type: 'working', message: 'Importing PPTX...' })
      const skipFirstSlides = template.importSkipFirst ?? 1
      const skipLastSlides = template.importSkipLast ?? 1
      const { importPptxSlides, importFirstLastSlideData } = await loadImportPptxModule()
      const { pairs: importedPairs, importedSlides, emptySlides } =
        await importPptxSlides(file, {
          skipFirstSlides,
          skipLastSlides,
          imageCount: template.imageCount || slotKeys.length,
          textboxDefs: currentRoute === ROUTES.master ? (customLayout?.textboxes || []) : [],
        })

      setPairs(
        normalizePairs(importedPairs, { slotKeys, requiresText, textDefault }),
      )

      if (currentRoute === ROUTES.master) {
        try {
          const { firstSlide, lastSlide } = await importFirstLastSlideData(file)
          if (firstSlide) {
            setImportedFirstSlide(firstSlide)
            importedFirstSlideRef.current = firstSlide
            setUseTemplateFirst(false)
            await savePairsToDb(`${storageKey}:imported-first`, firstSlide)
          } else {
            await removePairsFromDb(`${storageKey}:imported-first`)
          }
          if (lastSlide) {
            setImportedLastSlide(lastSlide)
            importedLastSlideRef.current = lastSlide
            setUseTemplateLast(false)
            await savePairsToDb(`${storageKey}:imported-last`, lastSlide)
          } else {
            await removePairsFromDb(`${storageKey}:imported-last`)
          }
          await savePairsToDb(`${storageKey}:imported-config`, { useTemplateFirst: false, useTemplateLast: false })
        } catch (err) {
          console.warn('Could not extract first/last slide elements:', err)
        }
      }

      const emptyNote = emptySlides
        ? ` ${emptySlides} slide(s) need images.`
        : ''
      const removedParts = []
      if (skipFirstSlides) {
        removedParts.push(`${skipFirstSlides} intro`)
      }
      if (skipLastSlides) {
        removedParts.push(`${skipLastSlides} ending`)
      }
      const removedNote = removedParts.length
        ? ` (${removedParts.join(' + ')} removed).`
        : '.'
      setImportStatus({
        type: 'success',
        message: `Imported ${importedSlides} slides${removedNote}${emptyNote}`,
      })
    } catch (error) {
      setImportStatus({
        type: 'error',
        message: error?.message || 'PPTX import failed.',
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleInsertPhotoAlbum = (imageDataUrls, imagesPerSlide = 1, mode = 'replace') => {
    if (!imageDataUrls || imageDataUrls.length === 0) return

    const effectiveImagesPerSlide = Math.min(
      Math.max(1, Number(imagesPerSlide)),
      slotKeys.length || 2
    )

    const chunks = []
    for (let i = 0; i < imageDataUrls.length; i += effectiveImagesPerSlide) {
      chunks.push(imageDataUrls.slice(i, i + effectiveImagesPerSlide))
    }

    const isDesilting = template?.masterTitle === TEMPLATES[ROUTES.desilting]?.masterTitle

    const newPairs = chunks.map((chunk, slideIndex) => {
      const pair = buildEmptyPair(slotKeys, textDefault)
      if (isDesilting && DESILTING_PRESET_TEXT[slideIndex]) {
        pair.slideText = DESILTING_PRESET_TEXT[slideIndex]
      }
      chunk.forEach((imgUrl, slotIndex) => {
        if (slotKeys[slotIndex]) {
          pair[slotKeys[slotIndex]] = imgUrl
        }
      })
      return pair
    })

    setPairs((prevPairs) => {
      let updatedPairs = []
      if (mode === 'replace') {
        updatedPairs = newPairs
      } else {
        const existingNonEmpty = trimTrailingEmptyPairs(prevPairs, { slotKeys, requiresText })
        if (isDesilting) {
          newPairs.forEach((pair, idx) => {
            const actualIdx = existingNonEmpty.length + idx
            if (DESILTING_PRESET_TEXT[actualIdx]) {
              pair.slideText = DESILTING_PRESET_TEXT[actualIdx]
            }
          })
        }
        updatedPairs = [...existingNonEmpty, ...newPairs]
      }
      return normalizePairs(updatedPairs, { slotKeys, requiresText, textDefault })
    })

    setImportStatus({
      type: 'success',
      message: `📸 Photo Album: Successfully inserted ${imageDataUrls.length} image(s) across ${chunks.length} slide(s) (${effectiveImagesPerSlide} image(s) per slide).`,
    })
  }




  const routeFileHandlesRef = useRef({})
  const routeNativePathsRef = useRef({})

  const activeNativePath = routeNativePathsRef.current[effectiveRouteKey] || activeTab?.routeNativePaths?.[effectiveRouteKey] || ''
  const activeWebName = (routeFileHandlesRef.current[effectiveRouteKey] || activeTab?.routeFileHandles?.[effectiveRouteKey])?.name || ''
  const activeHasImportedFile = Boolean(activeNativePath || activeWebName)
  const activeImportedFileName = activeNativePath ? activeNativePath.split(/[/\\]/).pop() : activeWebName

  const setImportedPath = (path) => {
    if (effectiveRouteKey) {
      routeNativePathsRef.current[effectiveRouteKey] = path || ''
      setTabs(prev => prev.map(t => {
        if (t.id === activeTabId) {
          const routeNativePaths = { ...(t.routeNativePaths || {}), [effectiveRouteKey]: path || '' }
          return { ...t, routeNativePaths }
        }
        return t
      }))
    }
  }

  const setReportFileHandle = (handle) => {
    if (effectiveRouteKey) {
      routeFileHandlesRef.current[effectiveRouteKey] = handle || null
      setTabs(prev => prev.map(t => {
        if (t.id === activeTabId) {
          const routeFileHandles = { ...(t.routeFileHandles || {}), [effectiveRouteKey]: handle || null }
          return { ...t, routeFileHandles }
        }
        return t
      }))
    }
  }

  const handlePptxButtonClick = async () => {
    // In Tauri, use the native file picker so we capture the disk path for
    // direct saves later (no dialog on subsequent Saves).
    if (typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI_IPC__)) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const nativePath = await invoke('pick_open_file')
        if (!nativePath) return // user cancelled
        const uint8Array = await invoke('read_binary_file', { path: nativePath })
        const fileName = nativePath.split(/[/\\]/).pop() || 'Presentation.pptx'
        const fileObj = new File([new Uint8Array(uint8Array)], fileName, {
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        })
        // Stash path so Save can write back directly to this specific template route
        setImportedPath(nativePath)
        // Feed into the existing import pipeline (synthetic event)
        await handlePptxUpload({ target: { files: [fileObj], value: '' } }, nativePath)
      } catch (err) {
        console.error('Tauri open for import failed:', err)
      }
      return
    }

    // In Web mode, use Native File System Access API if available
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
        setReportFileHandle(handle)
        await handlePptxUpload({ target: { files: [selectedFile], value: '' } })
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Web native open failed:', err)
      }
      return
    }

    pptxInputRef.current?.click()
  }

  const handleClearStored = async () => {
    const confirmed = window.confirm(
      'Clear stored slides for this report? This cannot be undone.',
    )
    if (!confirmed) {
      return
    }
    try {
      if (canUseStorage()) {
        window.localStorage.removeItem(storageKey)
      }
      await removePairsFromDb(storageKey)
      await removePairsFromDb(`${storageKey}:imported-first`)
      await removePairsFromDb(`${storageKey}:imported-last`)
      await removePairsFromDb(`${storageKey}:imported-config`)
    } finally {
      setPairs(normalizePairs([], { slotKeys, requiresText, textDefault }))
      setImportedFirstSlide(null)
      importedFirstSlideRef.current = null
      setUseTemplateFirst(false)
      setImportedLastSlide(null)
      importedLastSlideRef.current = null
      setUseTemplateLast(false)
      setImportStatus({ type: 'idle', message: '' })
      setDragIndex(null)
      setDragOverIndex(null)
      if (effectiveRouteKey) {
        delete routeNativePathsRef.current[effectiveRouteKey]
        delete routeFileHandlesRef.current[effectiveRouteKey]
        setTabs(prev => prev.map(t => {
          if (t.id === activeTabId) {
            const routeNativePaths = { ...(t.routeNativePaths || {}) }
            const routeFileHandles = { ...(t.routeFileHandles || {}) }
            delete routeNativePaths[effectiveRouteKey]
            delete routeFileHandles[effectiveRouteKey]
            return { ...t, routeNativePaths, routeFileHandles }
          }
          return t
        }))
      }
    }
  }

  const handleUseTemplateFirst = async () => {
    setUseTemplateFirst(true)
    await savePairsToDb(`${storageKey}:imported-config`, { useTemplateFirst: true, useTemplateLast })
  }
  const handleUseImportedFirst = async () => {
    setUseTemplateFirst(false)
    await savePairsToDb(`${storageKey}:imported-config`, { useTemplateFirst: false, useTemplateLast })
  }

  const handleUseTemplateLast = async () => {
    setUseTemplateLast(true)
    await savePairsToDb(`${storageKey}:imported-config`, { useTemplateFirst, useTemplateLast: true })
  }
  const handleUseImportedLast = async () => {
    setUseTemplateLast(false)
    await savePairsToDb(`${storageKey}:imported-config`, { useTemplateFirst, useTemplateLast: false })
  }

  const buildReportOptions = (overrides = {}) => {
    const resolvedFirstSlideUrl =
      currentRoute === ROUTES.dailyPlot && dailyVariant === 'rural'
        ? template.firstSlideUrlRural
        : template.firstSlideUrl
    const resolvedFileName =
      typeof template.fileName === 'function'
        ? template.fileName(dailyVariant)
        : template.fileName
    const backgroundImage = template.masterBgUrl
      ? new URL(template.masterBgUrl, window.location.href).toString()
      : undefined
    return {
      fileName: resolvedFileName,
      backgroundImage,
      firstSlideImage: resolvedFirstSlideUrl || undefined,
      secondSlideImage: template.secondSlideUrl || undefined,
      lastSlideImage: template.lastSlideUrl || undefined,
      fileNamePrefix: template.fileNamePrefix,
      slideTitle: template.slideTitle,
      masterTitle: template.masterTitle,
      leftBox: template.leftBox,
      middleBox: template.middleBox,
      rightBox: template.rightBox,
      dateSlide: template.dateSlide,
      dateBox: template.dateBox,
      dateColor: template.dateColor,
      dateAlign: template.dateAlign,
      dateFontSize: template.dateFontSize,
      dateBold: template.dateBold,
      dateFontFace: template.dateFontFace,
      dateOffsetDays: template.dateOffsetDays,
      textBox: template.textBox,
      textColor: template.textColor,
      textAlign: template.textAlign,
      textFontSize: template.textFontSize,
      textBold: template.textBold,
      textDefault: template.textDefault,
      placeholders: currentRoute === ROUTES.master ? customLayout?.placeholders : undefined,
      textboxes: currentRoute === ROUTES.master ? customLayout?.textboxes : undefined,
      firstSlidePlaceholders: currentRoute === ROUTES.master ? customLayout?.firstSlidePlaceholders : undefined,
      firstSlideTextboxes: currentRoute === ROUTES.master ? customLayout?.firstSlideTextboxes : undefined,
      firstSlideData: currentRoute === ROUTES.master ? firstSlideData : undefined,
      lastSlidePlaceholders: currentRoute === ROUTES.master ? customLayout?.lastSlidePlaceholders : undefined,
      lastSlideTextboxes: currentRoute === ROUTES.master ? customLayout?.lastSlideTextboxes : undefined,
      lastSlideData: currentRoute === ROUTES.master ? lastSlideData : undefined,
      ...overrides,
    }
  }

  const triggerBlobDownload = (blob, fileName) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const handleSaveReportDirect = async (forceSaveAs = false) => {
    if (!canDownload) return
    try {
      setIsGenerating(true)
      const { generateReport } = await loadGenerateReportModule()
      const { blob, fileName } = await generateReport(pairs, buildReportOptions())

      let finalBlob = blob
      if (currentRoute === ROUTES.master && (importedFirstSlide || importedLastSlide)) {
        const { postProcessPptxWithImportedSlides } = await loadImportPptxModule()
        const firstOpts = importedFirstSlide && !useTemplateFirst
          ? { importedSlide: importedFirstSlide, editedSlide: importedFirstSlideRef.current }
          : null
        const lastOpts = importedLastSlide && !useTemplateLast
          ? { importedSlide: importedLastSlide, editedSlide: importedLastSlideRef.current }
          : null
        finalBlob = await postProcessPptxWithImportedSlides(blob, firstOpts, lastOpts)
      }

      // ── Tauri: direct write to imported path, or picker for new files ─────
      if (typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI_IPC__)) {
        const { invoke } = await import('@tauri-apps/api/core')
        let targetPath = !forceSaveAs ? (routeNativePathsRef.current[effectiveRouteKey] || activeTab?.routeNativePaths?.[effectiveRouteKey]) : null

        if (!targetPath) {
          // No imported file path → show picker (new/scratch file or forced Save As)
          targetPath = await invoke('pick_save_file', { suggestedName: fileName })
          if (!targetPath) return // user cancelled
        }

        const buffer = await finalBlob.arrayBuffer()
        await invoke('write_binary_file', {
          path: targetPath,
          contents: Array.from(new Uint8Array(buffer)),
        })
        // Persist path on current route
        setImportedPath(targetPath)
        const shortName = targetPath.split(/[/\\]/).pop()
        alert(forceSaveAs
          ? `✓ Saved copy to "${shortName}"!`
          : `✓ Saved directly to "${shortName}" on disk!`)
        return
      }

      // ── Browser / Web File System Access API ─────────────────────────────
      const currentHandle = routeFileHandlesRef.current[effectiveRouteKey] || activeTab?.routeFileHandles?.[effectiveRouteKey]
      if (!forceSaveAs && currentHandle && typeof currentHandle.createWritable === 'function') {
        const writable = await currentHandle.createWritable()
        await writable.write(finalBlob)
        await writable.close()
        setReportFileHandle(currentHandle)
        alert(`✓ Saved directly to "${currentHandle.name}" on disk!`)
      } else if (typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: 'PowerPoint Presentation',
              accept: {
                'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
              },
            },
          ],
        })
        const writable = await handle.createWritable()
        await writable.write(finalBlob)
        await writable.close()
        setReportFileHandle(handle)
        alert(`✓ Saved to "${handle.name}" on disk!`)
      } else {
        triggerBlobDownload(finalBlob, fileName)
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('Save report error:', err)
        const rawErr = err?.message || (typeof err === 'string' ? err : JSON.stringify(err)) || 'Unknown error'
        const isLocked = typeof rawErr === 'string' && (rawErr.includes('used by another process') || rawErr.includes('os error 32') || rawErr.includes('Access is denied'))
        const extraHint = isLocked ? '\n\n💡 Hint: The file appears to be open in PowerPoint or another app. Please close PowerPoint and try saving again.' : ''
        alert('Failed to save presentation: ' + rawErr + extraHint)
      }
    } finally {
      setIsGenerating(false)
      // Clear dirty state for this tab after a successful save
      setTabDirty(activeTabId, false)
    }
  }

  const handleDownload = async () => {
    if (!canDownload) return
    try {
      setIsGenerating(true)
      const { generateReport } = await loadGenerateReportModule()
      const { blob, fileName } = await generateReport(pairs, buildReportOptions())

      if (currentRoute === ROUTES.master && (importedFirstSlide || importedLastSlide)) {
        const { postProcessPptxWithImportedSlides } = await loadImportPptxModule()
        const firstOpts = importedFirstSlide && !useTemplateFirst
          ? { importedSlide: importedFirstSlide, editedSlide: importedFirstSlideRef.current }
          : null
        const lastOpts = importedLastSlide && !useTemplateLast
          ? { importedSlide: importedLastSlide, editedSlide: importedLastSlideRef.current }
          : null
        const finalBlob = await postProcessPptxWithImportedSlides(blob, firstOpts, lastOpts)
        triggerBlobDownload(finalBlob, fileName)
      } else {
        triggerBlobDownload(blob, fileName)
      }
      // After successful download, clear dirty state for this tab
      setTabDirty(activeTabId, false)
    } finally {
      setIsGenerating(false)
    }
  }

  const [isGeneratingCompleted, setIsGeneratingCompleted] = useState(false)
  const canDownloadCompleted = slideCount > 0 && !isGenerating && !isGeneratingCompleted && !isImporting

  const handleDownloadCompleted = async () => {
    if (!canDownloadCompleted) return
    try {
      setIsGeneratingCompleted(true)
      const { generateCompletedSlidesReport } = await loadGenerateReportModule()
      const baseOptions = buildReportOptions()
      const completedFileName = baseOptions.fileName
        ? baseOptions.fileName.replace(/\.pptx$/i, '_Completed.pptx')
        : `${template.fileNamePrefix || 'Report'}_Completed.pptx`
      const { blob, fileName } = await generateCompletedSlidesReport(
        pairs, { ...baseOptions, fileName: completedFileName }
      )
      if (currentRoute === ROUTES.master && (importedFirstSlide || importedLastSlide)) {
        const { postProcessPptxWithImportedSlides } = await loadImportPptxModule()
        const firstOpts = importedFirstSlide && !useTemplateFirst
          ? { importedSlide: importedFirstSlide, editedSlide: importedFirstSlideRef.current }
          : null
        const lastOpts = importedLastSlide && !useTemplateLast
          ? { importedSlide: importedLastSlide, editedSlide: importedLastSlideRef.current }
          : null
        const finalBlob = await postProcessPptxWithImportedSlides(blob, firstOpts, lastOpts)
        triggerBlobDownload(finalBlob, fileName)
      } else {
        triggerBlobDownload(blob, fileName)
      }
    } finally {
      setIsGeneratingCompleted(false)
    }
  }

  const [isExportingZip, setIsExportingZip] = useState(false)

  const incompletePairsForZip = pairs.filter((pair) => {
    if (!hasPairContent(pair, { slotKeys, requiresText })) return false
    return !isPairComplete(pair, { slotKeys, requiresText })
  })
  const canExportZip = incompletePairsForZip.length > 0 && !isExportingZip && !isGenerating && !isImporting

  const handleExportRemainingPics = async () => {
    if (!canExportZip) return
    try {
      setIsExportingZip(true)
      const JSZip = await loadJsZip()
      const zip = new JSZip()
      let fileIndex = 1

      for (const pair of incompletePairsForZip) {
        for (const key of slotKeys) {
          const imgData = pair?.[key]
          if (!imgData || typeof imgData !== 'string') continue

          let blob
          let ext = 'jpg'

          if (imgData.startsWith('data:')) {
            const mimeMatch = imgData.match(/^data:([^;]+);base64,/)
            const mime = mimeMatch?.[1] || 'image/jpeg'
            const b64 = imgData.replace(/^data:[^;]+;base64,/, '')
            const byteChars = atob(b64)
            const byteArr = new Uint8Array(byteChars.length)
            for (let i = 0; i < byteChars.length; i++) {
              byteArr[i] = byteChars.charCodeAt(i)
            }
            blob = new Blob([byteArr], { type: mime })
            if (mime.includes('png')) ext = 'png'
            else if (mime.includes('webp')) ext = 'webp'
            else if (mime.includes('gif')) ext = 'gif'
            else ext = 'jpg'
          } else {
            try {
              const response = await fetch(imgData)
              blob = await response.blob()
              const ct = blob.type || ''
              if (ct.includes('png')) ext = 'png'
              else if (ct.includes('webp')) ext = 'webp'
              else if (ct.includes('gif')) ext = 'gif'
              else ext = 'jpg'
            } catch {
              continue
            }
          }

          const slotLabel = key.replace(/([A-Z])/g, '_$1').toUpperCase()
          zip.file(`slide_${String(fileIndex).padStart(3, '0')}_${slotLabel}.${ext}`, blob)
          fileIndex++
        }
      }

      if (fileIndex === 1) {
        alert('No images found in incomplete slides.')
        return
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      const prefix = template.fileNamePrefix || 'Report'
      a.download = `${prefix}_Remaining_Pics.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExportingZip(false)
    }
  }

  // --- EXTRACTED TAURI HANDLERS ---
  const isTauriEnv = () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI_IPC__)

  const handleMinimize = async () => {
    if (isTauriEnv()) {
      try {
        await getCurrentWindow().minimize()
      } catch (err) {
        console.error('Failed to minimize window:', err)
      }
    }
  }

  const handleMaximize = async () => {
    if (isTauriEnv()) {
      try {
        await getCurrentWindow().toggleMaximize()
      } catch (err) {
        console.error('Failed to toggle maximize window:', err)
      }
    }
  }

  const handleClose = async () => {
    if (isTauriEnv()) {
      try {
        // Check ALL tab types for unsaved changes
        const dirtyTabs = tabs.filter(t => t.isDirty)
        if (dirtyTabs.length > 0) {
          const fileNames = dirtyTabs.map(t => `• ${t.title || t.filename || 'Untitled'}`).join('\n')
          const shouldClose = window.confirm(
            `You have unsaved changes in ${dirtyTabs.length} tab${dirtyTabs.length > 1 ? 's' : ''}:\n${fileNames}\n\nClose anyway? All unsaved changes will be lost.`
          )
          if (!shouldClose) return  // User clicked Cancel — abort close
        }
        await getCurrentWindow().close()
      } catch (err) {
        console.error('Failed to close window:', err)
      }
    }
  }

  const handleTitlebarMouseDown = (e) => {
    if (e.buttons === 1 && isTauriEnv()) {
      const target = e.target
      if (target.hasAttribute('data-tauri-drag-region') || target.parentElement?.hasAttribute('data-tauri-drag-region')) {
        try {
          getCurrentWindow().startDragging()
        } catch (err) {
          console.error('Start dragging failed:', err)
        }
      }
    }
  }

  // --- FIXED MAIN RENDER ---
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* TAURI TITLEBAR */}
      {isTauriEnv() && (
        <div
          data-tauri-drag-region
          onMouseDown={handleTitlebarMouseDown}
          style={{
            height: '34px',
            background: 'var(--surface)',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            userSelect: 'none',
            paddingRight: '8px',
            borderBottom: '1px solid var(--border)',
            cursor: 'default'
          }}
        >
          <div
            data-tauri-drag-region
            style={{
              flex: 1,
              paddingLeft: '16px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--muted-foreground)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>📊 PPTXPro Desktop</span>
          </div>
          <button
            type="button"
            onClick={handleMinimize}
            title="Minimize"
            style={{ width: '36px', height: '34px', background: 'transparent', border: 'none', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6"></rect></svg>
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            title="Maximize"
            style={{ width: '36px', height: '34px', background: 'transparent', border: 'none', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12"><rect width="9" height="9" x="1.5" y="1.5" fill="none" stroke="currentColor"></rect></svg>
          </button>
          <button
            type="button"
            onClick={handleClose}
            title="Close"
            style={{ width: '36px', height: '34px', background: 'transparent', border: 'none', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseOver={e => { e.currentTarget.style.backgroundColor = '#ef4444'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--foreground)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M1.2 1.2l9.6 9.6M10.8 1.2L1.2 10.8" stroke="currentColor" strokeWidth="1.2"></path></svg>
          </button>
        </div>
      )}

      {/* GLOBAL TAB BAR */}
      <div className="pptx-editor__tabs" style={{ display: 'flex', background: 'var(--surface)', padding: '8px 16px 0', gap: '4px', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexShrink: 0 }}>
        {tabs.map(t => (
          <div
            key={t.id}
            onClick={() => setActiveTabId(t.id)}
            style={{
              padding: '8px 16px',
              background: t.id === activeTabId ? 'var(--background)' : 'transparent',
              color: t.id === activeTabId ? 'var(--foreground)' : 'var(--muted-foreground)',
              borderTopLeftRadius: 'var(--radius-sm)',
              borderTopRightRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: '1px solid',
              borderColor: t.id === activeTabId ? 'var(--border)' : 'transparent',
              borderBottom: 'none',
              minWidth: t.type === 'home' ? '60px' : '140px',
              maxWidth: '220px',
              borderBottom: t.id === activeTabId ? '1px solid var(--background)' : 'none',
              marginBottom: t.id === activeTabId ? '-1px' : '0'
            }}
          >
            {t.type === 'home' ? '🏠' : null}
            {/* 🟢 Unsaved-changes indicator — shown for ALL dirty tabs */}
            {t.isDirty && (
              <span
                title="Unsaved changes"
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#22c55e',
                  flexShrink: 0,
                  boxShadow: '0 0 4px #22c55e88',
                }}
              />
            )}
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: t.id === activeTabId ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.title}
            </span>
            {t.type !== 'home' && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                style={{
                  background: 'none', border: 'none', color: 'inherit',
                  cursor: 'pointer', padding: '2px', marginLeft: 'auto',
                  borderRadius: '50%', display: 'flex', alignItems: 'center'
                }}
              >✕</button>
            )}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative', background: 'var(--background)' }}>
        {tabs.map(tab => (
          <div key={tab.id} style={{ display: tab.id === activeTabId ? 'block' : 'none', height: '100%' }}>
            {tab.type === 'home' ? (
              <HomeTab onOpenTool={openToolTab} masterPresets={masterPresets} />
            ) : tab.type === 'document' ? (
              <Suspense fallback={<p>Loading...</p>}>
                <PptxEditor
                  initialFile={tab.file}
                  instanceId={tab.id}
                  tabs={tabs}
                  setTabs={setTabs}
                  activeTabId={activeTabId}
                  setActiveTabId={setActiveTabId}
                  onCloseTab={closeTab}
                  onOpenNew={() => { }}
                  onDirtyChange={(dirty) => setTabDirty(tab.id, dirty)}
                />
              </Suspense>
            ) : (
              // THIS IS THE MAIN TOOL RENDER BLOCK THAT GOT SWALLOWED
              <main
                className={`app${currentRoute === ROUTES.compliance ? ' app--compliance' : ''}${currentRoute === ROUTES.desilting ? ' app--desilting' : ''
                  }${currentRoute === ROUTES.dailyPlot ? ' app--daily-plot' : ''}`}
              >

                {currentRoute !== ROUTES.pptxEditor && (
                  <ReportHeader
                    template={template}
                    currentRoute={currentRoute}
                    ROUTES={ROUTES}
                    designerMode={effectiveDesignerMode}
                    slideCount={slideCount}
                    incompletePairCount={incompletePairsForZip.length}
                    isImporting={isImporting}
                    isGenerating={isGenerating}
                    isGeneratingCompleted={isGeneratingCompleted}
                    isExportingZip={isExportingZip}
                    canDownload={canDownload}
                    canDownloadCompleted={canDownloadCompleted}
                    canExportZip={canExportZip}
                    pptxInputRef={pptxInputRef}
                    handlePptxButtonClick={handlePptxButtonClick}
                    handlePptxUpload={handlePptxUpload}
                    handleClearStored={handleClearStored}
                    handleDownloadCompleted={handleDownloadCompleted}
                    handleExportRemainingPics={handleExportRemainingPics}
                    handleSaveReportDirect={handleSaveReportDirect}
                    handleDownload={handleDownload}
                    onSelectReport={(route) => {
                      const targetTab = tabs.find(t => t.id === activeTabId)
                      if (targetTab) {
                        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, route } : t))
                      }
                    }}
                    hasImportedFile={activeHasImportedFile}
                    importedFileName={activeImportedFileName}
                    onInsertPhotoAlbum={handleInsertPhotoAlbum}
                    slotKeys={slotKeys}
                  />
                )}

                {importStatus.message && (
                  <p className={`app__note app__note--${importStatus.type}`}>
                    {importStatus.message}
                  </p>
                )}

                {currentRoute === ROUTES.gpsPdf ? (
                  <Suspense fallback={routeFallback}>
                    <PptxToPdfOcr />
                  </Suspense>
                ) : currentRoute === ROUTES.pptxToPdf ? (
                  <Suspense fallback={routeFallback}>
                    <PptxToPdf />
                  </Suspense>
                ) : currentRoute === ROUTES.pptxEditor ? (
                  <Suspense fallback={routeFallback}>
                    <PptxEditor
                      tabs={tabs}
                      setTabs={setTabs}
                      activeTabId={activeTabId}
                      setActiveTabId={setActiveTabId}
                      onCloseTab={closeTab}
                      onOpenNew={(file) => openDocumentTab(file)}
                    />
                  </Suspense>
                ) : currentRoute === ROUTES.extract ? (
                  <Suspense fallback={routeFallback}>
                    <ImageExtractor />
                  </Suspense>
                ) : currentRoute === ROUTES.collage ? (
                  <Suspense fallback={routeFallback}>
                    <CollageMaker />
                  </Suspense>
                ) : currentRoute === ROUTES.merge ? (
                  <Suspense fallback={routeFallback}>
                    <PptxMerger />
                  </Suspense>
                ) : currentRoute === ROUTES.pdf ? (
                  <Suspense fallback={routeFallback}>
                    <PdfToPptx />
                  </Suspense>
                ) : currentRoute === ROUTES.mergePdf ? (
                  <Suspense fallback={routeFallback}>
                    <PdfMerger />
                  </Suspense>
                ) : currentRoute === ROUTES.master && effectiveDesignerMode === 'design' ? (
                  <Suspense fallback={routeFallback}>
                    <MasterDesigner
                      customLayout={customLayout}
                      designerMode={effectiveDesignerMode}
                      setDesignerMode={setEffectiveDesignerMode}
                      onDirtyChange={(dirty) => setTabDirty(activeTabId, dirty)}
                      onSave={async (layout) => {
                        setTabDirty(activeTabId, false)
                        if (effectivePresetId) {
                          const updated = masterPresets.map((p) =>
                            p.id === effectivePresetId ? { ...p, layout } : p,
                          )
                          setMasterPresets(updated)
                          await saveMasterPresets(updated)
                          alert('Active preset updated! Switch to "Use Template" to use it.')
                          setEffectiveDesignerMode('use')
                        } else {
                          await handleSaveNewPreset('Default', layout)
                        }
                      }}
                      presets={masterPresets}
                      activePresetId={effectivePresetId}
                      onSavePreset={(name, layout) => {
                        setTabDirty(activeTabId, false)
                        handleSaveNewPreset(name, layout)
                      }}
                      onLoadPreset={handleLoadPreset}
                      onDeletePreset={handleDeletePreset}
                      onRenamePreset={handleRenamePreset}
                      onExportPreset={handleExportPreset}
                      onExportAll={handleExportAllPresets}
                      onImportPresets={handleImportPresetsFile}
                    />
                  </Suspense>
                ) : (
                  <>
                    {currentRoute === ROUTES.master && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          padding: '12px 20px',
                          background: 'var(--surface)',
                          borderRadius: '12px',
                          border: '1px solid var(--border)',
                          marginBottom: '20px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '24px' }}>🎨</span>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--foreground)' }}>
                              {masterPresets.find((p) => p.id === effectivePresetId)?.name || 'Custom Master Template'}
                            </h3>
                            <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
                              Mode: {effectiveDesignerMode === 'use' ? '🚀 Template Fill & Report Generation' : '✏️ Layout Designer'}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            type="button"
                            className="button button--secondary"
                            style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                            onClick={() => setEffectiveDesignerMode('design')}
                            title="Return to canvas editor to modify placeholders and layout"
                          >
                            ✏️ Edit / Redesign Layout
                          </button>
                        </div>
                      </div>
                    )}
                    <section className="card card--theme">
                      <div>
                        <p className="label">{template.themeLabel}</p>
                        <p className="value">
                          Using background image:{' '}
                          <span>
                            {template.masterBgUrl
                              ? template.masterBgUrl.startsWith('data:')
                                ? 'Custom background data'
                                : template.masterBgUrl
                              : 'None'}
                          </span>
                        </p>
                      </div>
                      {currentRoute !== ROUTES.master && (
                        <p className="value">
                          Export your master slide from the PPTX as PNG and place it in the
                          public folder with this name. The image should include the title and
                          footer styling.
                        </p>
                      )}
                    </section>

                    <section className="pairs">
                      {/* ── First slide: imported editor or template slide ── */}
                      {currentRoute === ROUTES.master && importedFirstSlide && !useTemplateFirst ? (
                        <ImportedSlideEditor
                          title="First Slide (from imported PPTX)"
                          slideData={importedFirstSlide}
                          onUseTemplate={handleUseTemplateFirst}
                          onChange={(data) => {
                            importedFirstSlideRef.current = data
                            setImportedFirstSlide(data)
                            savePairsToDb(`${storageKey}:imported-first`, data)
                          }}
                        />
                      ) : (
                        currentRoute === ROUTES.master && (
                          <>
                            {importedFirstSlide && useTemplateFirst && (
                              <article className="pair" style={{ border: '2px solid rgba(124, 58, 237, 0.4)', background: 'rgba(124, 58, 237, 0.03)' }}>
                                <div className="pair__header">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <p className="label" style={{ margin: 0, color: '#7c3aed', fontWeight: 700 }}>
                                      📎 First Slide: Using Default Template Slide
                                    </p>
                                    <span className="pair__status">Template Mode Active</span>
                                  </div>
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={handleUseImportedFirst}
                                    style={{ borderColor: '#7c3aed', color: '#7c3aed', fontWeight: 600 }}
                                    title="Switch back to using and editing the first slide imported from the PPTX"
                                  >
                                    ↩ Use Imported Slide
                                  </button>
                                </div>
                              </article>
                            )}

                            {((customLayout?.firstSlidePlaceholders?.length > 0) || (customLayout?.firstSlideTextboxes?.length > 0)) && (
                              <article className="pair" style={{ border: '2px solid rgba(11, 122, 56, 0.4)' }}>
                                <div className="pair__header">
                                  <p className="label" style={{ fontWeight: 'bold', color: '#0b7a38' }}>Title Slide (First Slide)</p>
                                  <span className="pair__status is-complete">Cover Slide</span>
                                </div>
                                <SlideCanvas
                                  pair={firstSlideData}
                                  slots={(customLayout?.firstSlidePlaceholders || []).map((p) => ({
                                    key: p.key,
                                    label: p.label,
                                    className: 'slide-slot',
                                    style: {
                                      left: `${(p.x / 13.333) * 100}%`,
                                      top: `${(p.y / 7.5) * 100}%`,
                                      width: `${(p.w / 13.333) * 100}%`,
                                      height: `${(p.h / 7.5) * 100}%`,
                                      position: 'absolute',
                                      borderRadius: p.borderRadius ? `${p.borderRadius}px` : '0px',
                                    },
                                  }))}
                                  onChange={(key, value) => {
                                    setFirstSlideData((prev) => {
                                      const next = { ...prev, [key]: value }
                                      if (activePresetId) savePairsToDb(`pptxpro:custom-first-slide-data:${activePresetId}`, next)
                                      return next
                                    })
                                  }}
                                  backgroundUrl={customLayout?.firstSlideUrl}
                                  textBoxes={customLayout?.firstSlideTextboxes || []}
                                  onTextChange={(key, value) => {
                                    setFirstSlideData((prev) => {
                                      const next = { ...prev, [key]: value }
                                      if (activePresetId) savePairsToDb(`pptxpro:custom-first-slide-data:${activePresetId}`, next)
                                      return next
                                    })
                                  }}
                                />
                              </article>
                            )}
                          </>
                        )
                      )}

                      {pairs.map((pair, index) => (
                        <PairCard
                          key={`pair-${index}`}
                          pair={pair}
                          index={index}
                          template={template}
                          slotKeys={slotKeys}
                          requiresText={requiresText}
                          movableCount={movableCount}
                          dragIndex={dragIndex}
                          dragOverIndex={dragOverIndex}
                          moveMenuIndex={moveMenuIndex}
                          pairRef={(node) => {
                            pairRefs.current[index] = node
                          }}
                          moveMenuRef={moveMenuRef}
                          onUpdatePair={updatePair}
                          onSwapImages={swapPairImages}
                          onDragStart={handlePairDragStart}
                          onDragEnd={handlePairDragEnd}
                          onDragOver={handlePairDragOver}
                          onDrop={handlePairDrop}
                          onMovePair={movePair}
                          onSetMoveMenuIndex={setMoveMenuIndex}
                        />
                      ))}

                      {/* ── Last slide: imported editor or template slide ── */}
                      {currentRoute === ROUTES.master && importedLastSlide && !useTemplateLast ? (
                        <ImportedSlideEditor
                          title="Last Slide (from imported PPTX)"
                          slideData={importedLastSlide}
                          onUseTemplate={handleUseTemplateLast}
                          onChange={(data) => {
                            importedLastSlideRef.current = data
                            setImportedLastSlide(data)
                            savePairsToDb(`${storageKey}:imported-last`, data)
                          }}
                        />
                      ) : (
                        currentRoute === ROUTES.master && (
                          <>
                            {importedLastSlide && useTemplateLast && (
                              <article className="pair" style={{ border: '2px solid rgba(124, 58, 237, 0.4)', background: 'rgba(124, 58, 237, 0.03)' }}>
                                <div className="pair__header">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <p className="label" style={{ margin: 0, color: '#7c3aed', fontWeight: 700 }}>
                                      📎 Last Slide: Using Default Template Slide
                                    </p>
                                    <span className="pair__status">Template Mode Active</span>
                                  </div>
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={handleUseImportedLast}
                                    style={{ borderColor: '#7c3aed', color: '#7c3aed', fontWeight: 600 }}
                                    title="Switch back to using and editing the last slide imported from the PPTX"
                                  >
                                    ↩ Use Imported Slide
                                  </button>
                                </div>
                              </article>
                            )}

                            {((customLayout?.lastSlidePlaceholders?.length > 0) || (customLayout?.lastSlideTextboxes?.length > 0)) && (
                              <article className="pair" style={{ border: '2px solid rgba(11, 122, 56, 0.4)' }}>
                                <div className="pair__header">
                                  <p className="label" style={{ fontWeight: 'bold', color: '#0b7a38' }}>Closing Slide (Last Slide)</p>
                                  <span className="pair__status is-complete">End Slide</span>
                                </div>
                                <SlideCanvas
                                  pair={lastSlideData}
                                  slots={(customLayout?.lastSlidePlaceholders || []).map((p) => ({
                                    key: p.key,
                                    label: p.label,
                                    className: 'slide-slot',
                                    style: {
                                      left: `${(p.x / 13.333) * 100}%`,
                                      top: `${(p.y / 7.5) * 100}%`,
                                      width: `${(p.w / 13.333) * 100}%`,
                                      height: `${(p.h / 7.5) * 100}%`,
                                      position: 'absolute',
                                      borderRadius: p.borderRadius ? `${p.borderRadius}px` : '0px',
                                    },
                                  }))}
                                  onChange={(key, value) => {
                                    setLastSlideData((prev) => {
                                      const next = { ...prev, [key]: value }
                                      if (activePresetId) savePairsToDb(`pptxpro:custom-last-slide-data:${activePresetId}`, next)
                                      return next
                                    })
                                  }}
                                  backgroundUrl={customLayout?.lastSlideUrl}
                                  textBoxes={customLayout?.lastSlideTextboxes || []}
                                  onTextChange={(key, value) => {
                                    setLastSlideData((prev) => {
                                      const next = { ...prev, [key]: value }
                                      if (activePresetId) savePairsToDb(`pptxpro:custom-last-slide-data:${activePresetId}`, next)
                                      return next
                                    })
                                  }}
                                />
                              </article>
                            )}
                          </>
                        )
                      )}
                    </section>
                  </>
                )}

              </main>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
export default App;