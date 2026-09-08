const fs = require('fs');

const lines = fs.readFileSync('src/App.jsx.bak', 'utf-8').split('\n');

let newLines = [];
let inRender = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (line.includes('import Navbar from')) {
    newLines.push(line);
    newLines.push("import { HomeTab } from './HomeTab';");
    newLines.push("import { PptxWorkspace as PptxEditor } from './PptxWorkspace';");
    newLines.push("import { loadPptxEditorState } from './utils/storage';");
    newLines.push("import { getCurrentWindow } from '@tauri-apps/api/window';");
    continue;
  }

  if (line.includes('function App({ data }) {')) {
    newLines.push(line);
    newLines.push(`
  const [tabs, setTabs] = useState([{ id: 'home', type: 'home', title: 'Home' }])
  const [activeTabId, setActiveTabId] = useState('home')
  const [isGlobalTabsHydrated, setIsGlobalTabsHydrated] = useState(false)

  useEffect(() => {
    const hydrate = async () => {
      try {
        const saved = await loadPptxEditorState()
        if (saved && saved.tabs && saved.tabs.length > 0) {
          const savedDocs = saved.tabs.filter(t => t.id !== 'home').map(t => ({...t, type: 'document'}))
          setTabs([{ id: 'home', type: 'home', title: 'Home' }, ...savedDocs])
          setActiveTabId(saved.activeTabId || 'home')
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
    import('./utils/storage').then(({ savePptxEditorState }) => {
      savePptxEditorState({
        activeTabId,
        tabs: tabs.filter(t => t.id !== 'home')
      })
    })
  }, [tabs, activeTabId, isGlobalTabsHydrated])

  const openToolTab = (tool) => {
    const existing = tabs.find(t => t.type === 'tool' && t.toolId === tool.id)
    if (existing) {
      setActiveTabId(existing.id)
      return
    }
    const newTab = { id: \`tab_\${Date.now()}\`, type: 'tool', toolId: tool.id, title: tool.name, route: tool.route }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
  }
  
  const openDocumentTab = (file) => {
    const newTab = { id: \`doc_\${Date.now()}\`, type: 'document', title: file.name, file }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  const closeTab = (id) => {
    if (id === 'home') return
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (activeTabId === id) {
        const idx = prev.findIndex(t => t.id === id)
        setActiveTabId(next[Math.max(0, idx - 1)].id)
      }
      return next
    })
  }

  const handleMinimize = () => { if (window.__TAURI_INTERNALS__) getCurrentWindow().minimize() }
  const handleMaximize = () => { if (window.__TAURI_INTERNALS__) getCurrentWindow().toggleMaximize() }
  const handleClose = () => { if (window.__TAURI_INTERNALS__) getCurrentWindow().close() }
`);
    continue;
  }

  if (line.includes('const currentRoute = normalizeRoute(window.location.pathname)')) {
    newLines.push(`
  const activeTab = tabs.find(t => t.id === activeTabId)
  const currentRoute = activeTab?.route || ROUTES.clean
`);
    continue;
  }

  // Remove Navbar rendering block
  if (line.includes('<Navbar')) {
    // skip until />
    while (!lines[i].includes('/>')) i++;
    continue;
  }
  
  // The big return statement is right after `setIsExportingZip(false)` in `handleExportRemainingPics`
  // Actually, let's just look for `return (` where the next line includes `className={\`app`
  if (line.includes('return (') && (lines[i+1] || '').includes('className={`app')) {
    newLines.push(line);
    newLines.push(`
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* TAURI TITLEBAR */}
      {window.__TAURI_INTERNALS__ && (
        <div data-tauri-drag-region style={{
          height: '32px',
          background: 'var(--surface)',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          userSelect: 'none',
          paddingRight: '8px'
        }}>
          <div data-tauri-drag-region style={{ flex: 1, paddingLeft: '16px', fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)' }}>PPTXPro</div>
          <button type="button" onClick={handleMinimize} style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6"></rect></svg>
          </button>
          <button type="button" onClick={handleMaximize} style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12"><rect width="9" height="9" x="1.5" y="1.5" fill="none" stroke="currentColor"></rect></svg>
          </button>
          <button type="button" onClick={handleClose} style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', color: 'var(--foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseOver={e => e.currentTarget.style.color='red'} onMouseOut={e => e.currentTarget.style.color='var(--foreground)'}>
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
              <HomeTab onOpenTool={openToolTab} />
            ) : tab.type === 'document' ? (
              <Suspense fallback={<p>Loading...</p>}>
                <PptxEditor 
                  tabs={tabs} 
                  setTabs={setTabs} 
                  activeTabId={activeTabId} 
                  setActiveTabId={setActiveTabId} 
                  onCloseTab={closeTab} 
                  onOpenNew={openDocumentTab} 
                />
              </Suspense>
            ) : (
`);
    inRender = true;
    continue;
  }

  if (inRender && line.includes('</main>')) {
    newLines.push(line);
    newLines.push(`
            )}
          </div>
        ))}
      </div>
    </div>
`);
    continue;
  }

  // Remove the old `<PptxEditor />` instance that is conditionally rendered later in the old return
  if (inRender && line.includes('<PptxEditor')) {
    continue;
  }

  newLines.push(line);
}

fs.writeFileSync('src/App.jsx', newLines.join('\n'), 'utf-8');
console.log("App.jsx fixed successfully");
