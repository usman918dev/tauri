import React from 'react'

export function HomeTab({ onOpenTool, masterPresets = [] }) {
  const reports = [
    {
      id: 'clean-punjab',
      route: '/',
      name: 'Clean Punjab Report',
      description: 'Plots Cleaning-Activity report with automated before/after slides.',
      icon: '📊',
    },
    {
      id: 'compliance-report',
      route: '/compliance',
      name: 'Compliance Report',
      description: 'Suthra Punjab compliance tracking & verification report.',
      icon: '🛡️',
    },
    {
      id: 'desilting-report',
      route: '/desilting',
      name: 'Desilting Report',
      description: '3-stage Sector Desilting presentation generator.',
      icon: '💧',
    },
    {
      id: 'daily-plot-report',
      route: '/daily-plot',
      name: 'OTC Plot Report',
      description: 'Daily Plot clearance reports (Urban & Rural variants).',
      icon: '📍',
    },
  ]

  const studioAndTools = [
    {
      id: 'master-designer',
      route: '/master',
      name: 'Master Creator',
      description: 'Design custom master slide layouts, placeholders & presets.',
      icon: '🎨',
    },
    {
      id: 'pptx-editor',
      route: '/pptx-editor',
      name: 'PPTX Studio Editor',
      description: 'Dual-mode editor with Quick Tag Edit & Full Visual Canvas.',
      icon: '📝',
    },
    {
      id: 'image-extractor',
      route: '/extract',
      name: 'Image Extractor',
      description: 'Extract all high-resolution images from a PPTX file.',
      icon: '🖼️',
    },
    {
      id: 'pdf-to-pptx',
      route: '/pdf',
      name: 'PDF to PPTX',
      description: 'Convert PDF pages directly into PowerPoint slides.',
      icon: '📄',
    },
    {
      id: 'pptx-to-pdf',
      route: '/pptx-to-pdf',
      name: 'PPTX to PDF',
      description: 'Convert PowerPoint slides into a PDF document.',
      icon: '📑',
    },
    {
      id: 'pdf-merger',
      route: '/merge-pdf',
      name: 'Merge PDFs',
      description: 'Combine multiple PDF files into one.',
      icon: '🔗',
    },
    {
      id: 'pptx-merger',
      route: '/merge',
      name: 'Merge PPTXs',
      description: 'Combine multiple PPTX presentations.',
      icon: '🖇️',
    },
    {
      id: 'collage-maker',
      route: '/collage',
      name: 'Collage Maker',
      description: 'Create slide collages from bulk images.',
      icon: '🔲',
    },
    {
      id: 'ocr-studio',
      route: '/gps-pdf',
      name: 'OCR Studio',
      description: 'Extract text and GPS coordinate data from slides.',
      icon: '🔍',
    },
  ]

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', animation: 'rise 0.4s ease-out' }}>
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: '8px', color: 'var(--foreground)' }}>Home</h1>
      <p style={{ color: 'var(--muted-foreground)', marginBottom: '32px' }}>Select a tool or report generator to open it in a new tab.</p>

      {/* Presentation Reports Section */}
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '16px' }}>
        📊 Presentation Reports
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '20px',
        marginBottom: '40px'
      }}>
        {reports.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onOpenTool(tool)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '20px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)'
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'none'
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '4px' }}>{tool.icon}</div>
            <h3 style={{ fontSize: 'var(--text-base)', margin: 0, color: 'var(--foreground)' }}>{tool.name}</h3>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>{tool.description}</p>
          </button>
        ))}
      </div>

      {/* Studio & Tools Section */}
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '16px' }}>
        🛠️ Studio & Converters
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '20px',
        marginBottom: masterPresets.length > 0 ? '40px' : '0',
      }}>
        {studioAndTools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onOpenTool(tool)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '20px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)'
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = 'none'
              e.currentTarget.style.transform = 'none'
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '4px' }}>{tool.icon}</div>
            <h3 style={{ fontSize: 'var(--text-base)', margin: 0, color: 'var(--foreground)' }}>{tool.name}</h3>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>{tool.description}</p>
          </button>
        ))}
      </div>

      {/* Saved Master Templates Gallery */}
      {masterPresets.length > 0 && (
        <>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '6px' }}>
            🎨 Saved Master Templates
          </h2>
          <p style={{ color: 'var(--muted-foreground)', marginBottom: '20px', fontSize: '14px' }}>
            Select a template below to open its report generator or edit its layout in a new tab.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
          }}>
            {masterPresets.map((preset) => (
              <div
                key={preset.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary)'
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ height: '130px', background: '#f0ece3', position: 'relative', overflow: 'hidden' }}>
                  {preset.layout?.masterBgUrl ? (
                    <img src={preset.layout.masterBgUrl} alt={preset.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '36px' }}>🖼️</div>
                  )}
                </div>
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  <h3 style={{ fontSize: 'var(--text-base)', margin: 0, color: 'var(--foreground)', fontWeight: 600 }}>{preset.name}</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted-foreground)' }}>
                    {preset.layout?.placeholders?.length || 0} image slot(s) · {preset.layout?.textboxes?.length || 0} text box(es)
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '12px' }}>
                    <button
                      type="button"
                      className="button"
                      style={{ flex: 1, padding: '6px 10px', fontSize: '12px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', borderColor: 'transparent', color: '#fff', fontWeight: 600 }}
                      onClick={() => onOpenTool({
                        id: `preset_${preset.id}_use`,
                        toolId: 'master',
                        presetId: preset.id,
                        name: preset.name,
                        route: '/master',
                        designerMode: 'use',
                      })}
                    >
                      🚀 Open Report
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                      onClick={() => onOpenTool({
                        id: `preset_${preset.id}_design`,
                        toolId: 'master',
                        presetId: preset.id,
                        name: `Design: ${preset.name}`,
                        route: '/master',
                        designerMode: 'design',
                      })}
                    >
                      ✏️ Edit Layout
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
