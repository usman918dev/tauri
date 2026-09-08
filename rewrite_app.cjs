const fs = require('fs');

const content = fs.readFileSync('src/App.jsx.bak', 'utf-8');

// Find where the App component render starts
const renderMatch = content.match(/return \([\s\S]*?<main[\s\S]*?className=\{`app/);
if (!renderMatch) {
  console.log("Could not find render start");
  process.exit(1);
}

let beforeRender = content.substring(0, renderMatch.index);
let oldRender = content.substring(renderMatch.index);

// We need to inject the tab state just after `function App({ data }) {`
const appDeclMatch = beforeRender.match(/function App\(\{ data \}\) \{/);
if (appDeclMatch) {
  const insertIndex = appDeclMatch.index + appDeclMatch[0].length;
  beforeRender = beforeRender.substring(0, insertIndex) + `
  const [tabs, setTabs] = useState([{ id: 'home', type: 'home', title: 'Home' }])
  const [activeTabId, setActiveTabId] = useState('home')

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

  const activeTab = tabs.find(t => t.id === activeTabId)
  const currentRoute = activeTab?.route || ROUTES.clean
` + beforeRender.substring(insertIndex).replace(/const currentRoute = normalizeRoute\(window\.location\.pathname\)/g, '');
}

// Remove Navbar rendering from oldRender
oldRender = oldRender.replace(/<Navbar[\s\S]*?\/>/, '');

// Wrap the old render
const newRender = `
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
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
                  initialFile={tab.file} 
                  instanceId={tab.id} 
                  tabs={tabs} 
                  setTabs={setTabs} 
                  activeTabId={activeTabId} 
                  setActiveTabId={setActiveTabId} 
                  onCloseTab={closeTab} 
                  onOpenNew={() => {}} 
                />
              </Suspense>
            ) : (
` + oldRender.replace(/return \(/, '').replace(/<\/main>\s*\)\s*\}\s*export default App/, `
              </main>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
export default App
`);

let finalCode = beforeRender + newRender;

// Add HomeTab and PptxWorkspace imports at top
if (!finalCode.includes("import { HomeTab }")) {
  finalCode = finalCode.replace("import Navbar", "import { HomeTab } from './HomeTab';\nimport { PptxWorkspace as PptxEditor } from './PptxWorkspace';\nimport Navbar");
}

fs.writeFileSync('src/App.jsx', finalCode, 'utf-8');
console.log("App.jsx rewritten successfully");
