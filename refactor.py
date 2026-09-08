import os

# --- Read App.jsx ---
with open('src/App.jsx', 'r', encoding='utf-8') as f:
    app_lines = f.readlines()

# --- Rewrite App.jsx to include global tabs ---
# We'll inject the tabs state at the start of App component (around line 85)
# We'll replace the render method to include the Tab Bar.

new_app_lines = []
in_render = False

for i, line in enumerate(app_lines):
    if 'function App({ data }) {' in line:
        new_app_lines.append(line)
        new_app_lines.append("""
  const [tabs, setTabs] = useState([{ id: 'home', type: 'home', title: 'Home' }])
  const [activeTabId, setActiveTabId] = useState('home')

  const openToolTab = (tool) => {
    // If it's a singleton tool, check if it's already open
    const existing = tabs.find(t => t.type === 'tool' && t.toolId === tool.id)
    if (existing) {
      setActiveTabId(existing.id)
      return
    }
    const newTab = { id: `tab_${Date.now()}`, type: 'tool', toolId: tool.id, title: tool.name, route: tool.route }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
  }
  
  const openDocumentTab = (file) => {
    const newTab = { id: `doc_${Date.now()}`, type: 'document', title: file.name, file }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  const closeTab = (id) => {
    if (id === 'home') return // Cannot close home
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (activeTabId === id) {
        // Switch to the previous tab
        const idx = prev.findIndex(t => t.id === id)
        setActiveTabId(next[Math.max(0, idx - 1)].id)
      }
      return next
    })
  }

""")
        continue
        
    if 'const currentRoute = normalizeRoute(window.location.pathname)' in line:
        # Replace currentRoute with one derived from activeTabId
        new_app_lines.append("""
  const activeTab = tabs.find(t => t.id === activeTabId)
  const currentRoute = activeTab?.route || ROUTES.clean
""")
        continue

    if 'return (' in line and 'className={`app' in app_lines[i+1]:
        # We found the start of the return statement
        in_render = True
        new_app_lines.append("""
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* GLOBAL TAB BAR */}
      <div className="pptx-editor__tabs" style={{ display: 'flex', background: 'var(--background)', padding: '8px 16px 0', gap: '4px', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexShrink: 0 }}>
        {tabs.map(t => (
          <div
            key={t.id}
            onClick={() => setActiveTabId(t.id)}
            style={{
              padding: '8px 16px',
              background: t.id === activeTabId ? 'var(--primary-tint)' : 'transparent',
              color: t.id === activeTabId ? 'var(--foreground)' : 'var(--muted-foreground)',
              borderTopLeftRadius: 'var(--radius-sm)',
              borderTopRightRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: '1px solid',
              borderColor: t.id === activeTabId ? 'var(--primary)' : 'transparent',
              borderBottom: 'none',
              minWidth: t.type === 'home' ? '60px' : '140px',
              maxWidth: '220px',
              borderBottom: t.id === activeTabId ? '2px solid var(--primary)' : 'none',
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
      
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {tabs.map(tab => (
          <div key={tab.id} style={{ display: tab.id === activeTabId ? 'block' : 'none', height: '100%' }}>
            {tab.type === 'home' ? (
              <HomeTab onOpenTool={openToolTab} />
            ) : tab.type === 'document' ? (
              <PptxWorkspace initialFile={tab.file} instanceId={tab.id} />
            ) : (
              <main className={`app${tab.route === ROUTES.compliance ? ' app--compliance' : ''}${tab.route === ROUTES.desilting ? ' app--desilting' : ''}${tab.route === ROUTES.dailyPlot ? ' app--daily-plot' : ''}`}>
                <AppContent currentRoute={tab.route} />
              </main>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AppContent({ currentRoute }) {
  // We need to pass all the required state down, or just keep it in App for now
""")
        break
        
    new_app_lines.append(line)

# Since AppContent needs the rest of the render body, it's easier to just conditionally render the old content inside the loop, rather than breaking it out.
# Wait, let's inject the wrapper right into the existing render instead of breaking it out.
new_app_lines = []
for i, line in enumerate(app_lines):
new_app_lines = []

for i, line in enumerate(app_lines):
    if 'import Navbar from' in line:
        new_app_lines.append(line)
        new_app_lines.append("import { HomeTab } from './HomeTab'\n")
        new_app_lines.append("import { PptxEditor } from './PptxEditor'\n")
        new_app_lines.append("import { Suspense } from 'react'\n")
        continue

    if 'function App({ data }) {' in line:
        new_app_lines.append(line)
        new_app_lines.append("""
  const [tabs, setTabs] = useState([{ id: 'home', type: 'home', title: 'Home' }])
  const [activeTabId, setActiveTabId] = useState('home')

  const openToolTab = (tool) => {
    const existing = tabs.find(t => t.type === 'tool' && t.toolId === tool.id)
    if (existing) {
      setActiveTabId(existing.id)
      return
    }
    const newTab = { id: `tab_${Date.now()}`, type: 'tool', toolId: tool.id, title: tool.name, route: tool.route }
    setTabs(prev => [...prev, newTab])
    setActiveTabId(newTab.id)
  }
  
  const openDocumentTab = (file) => {
    const newTab = { id: `doc_${Date.now()}`, type: 'document', title: file.name, file }
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
""")
        continue
    
    if 'const currentRoute = normalizeRoute(window.location.pathname)' in line:
        new_app_lines.append("""
  const activeTab = tabs.find(t => t.id === activeTabId)
  const currentRoute = activeTab?.route || ROUTES.clean
""")
        continue

    if '<Navbar' in line:
        continue
    if 'currentRoute={currentRoute}' in line and 'designerMode=' in app_lines[i+2]:
        continue
    if 'ROUTES={ROUTES}' in line and '/>' in app_lines[i+1]:
        continue
    if '/>' in line and 'ROUTES={ROUTES}' in app_lines[i-1]:
        continue
    if 'setDailyVariant={setDailyVariant}' in line or 'dailyVariant={dailyVariant}' in line or 'designerMode={designerMode}' in line or 'setDesignerMode={setDesignerMode}' in line or 'customLayout={customLayout}' in line:
        # Ignore navbar props
        if '<Navbar' in app_lines[i-3] or '<Navbar' in app_lines[i-2] or '<Navbar' in app_lines[i-1]:
             continue

    if 'return (' in line and 'className={`app' in app_lines[i+1]:
        new_app_lines.append(line)
        new_app_lines.append("""
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
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {tabs.map(tab => (
          <div key={tab.id} style={{ display: tab.id === activeTabId ? 'block' : 'none', height: '100%' }}>
            {tab.type === 'home' ? (
              <HomeTab onOpenTool={openToolTab} />
            ) : tab.type === 'document' ? (
              <Suspense fallback={<p>Loading...</p>}>
                <PptxEditor initialFile={tab.file} instanceId={tab.id} />
              </Suspense>
            ) : (
""")
        continue

    if '</main>' in line:
        new_app_lines.append(line)
        new_app_lines.append("""
            )}
          </div>
        ))}
      </div>
    </div>
""")
        continue

    new_app_lines.append(line)

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.writelines(new_app_lines)
