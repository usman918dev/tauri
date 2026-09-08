const fs = require('fs');

const app_lines = fs.readFileSync('src/App.jsx.bak', 'utf-8').split('\n');
let new_app_lines = [];

for (let i = 0; i < app_lines.length; i++) {
    const line = app_lines[i];
    
    if (line.includes('import Navbar from')) {
        new_app_lines.push(line);
        new_app_lines.push("import { HomeTab } from './HomeTab'");
        new_app_lines.push("import { PptxWorkspace as PptxEditor } from './PptxWorkspace'");
        continue;
    }

    if (line.includes('function App({ data }) {')) {
        new_app_lines.push(line);
        new_app_lines.push(`
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
`);
        continue;
    }

    if (line.includes('const currentRoute = normalizeRoute(window.location.pathname)')) {
        new_app_lines.push(`
  const activeTab = tabs.find(t => t.id === activeTabId)
  const currentRoute = activeTab?.route || ROUTES.clean
`);
        continue;
    }

    if (line.includes('<Navbar')) {
        continue;
    }
    if (line.includes('currentRoute={currentRoute}') && (app_lines[i+2] || '').includes('designerMode=')) {
        continue;
    }
    if (line.includes('ROUTES={ROUTES}') && (app_lines[i+1] || '').includes('/>')) {
        continue;
    }
    if (line.includes('/>') && (app_lines[i-1] || '').includes('ROUTES={ROUTES}')) {
        continue;
    }
    if (line.includes('setDailyVariant={setDailyVariant}') || line.includes('dailyVariant={dailyVariant}') || line.includes('designerMode={designerMode}') || line.includes('setDesignerMode={setDesignerMode}') || line.includes('customLayout={customLayout}')) {
        if ((app_lines[i-3] || '').includes('<Navbar') || (app_lines[i-2] || '').includes('<Navbar') || (app_lines[i-1] || '').includes('<Navbar')) {
            continue;
        }
    }

    if (line.includes('return (') && (app_lines[i+1] || '').includes('className={`app')) {
        new_app_lines.push(line);
        new_app_lines.push(`
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
                <PptxEditor initialFile={tab.file} instanceId={tab.id} />
              </Suspense>
            ) : (
`);
        continue;
    }

    if (line.includes('</main>')) {
        new_app_lines.push(line);
        new_app_lines.push(`
            )}
          </div>
        ))}
      </div>
    </div>
`);
        continue;
    }

    new_app_lines.push(line);
}

fs.writeFileSync('src/App.jsx', new_app_lines.join('\n'), 'utf-8');
