import React from 'react'

export function HomeTab({ onOpenTool }) {
  const tools = [
    {
      id: 'quick-report',
      route: '/',
      name: 'Quick Report Generator',
      description: 'Generate reports from standard templates.',
      icon: '📊',
    },
    {
      id: 'master-designer',
      route: '/master',
      name: 'Master Designer',
      description: 'Design custom PPTX layouts and placeholders.',
      icon: '🎨',
    },
    {
      id: 'pptx-editor',
      route: '/editor',
      name: 'PPTX Studio Editor',
      description: 'Full WYSIWYG editor for PPTX presentations.',
      icon: '📝',
    },
    {
      id: 'image-extractor',
      route: '/extract',
      name: 'Image Extractor',
      description: 'Extract all images from a PPTX file.',
      icon: '🖼️',
    },
    {
      id: 'pdf-to-pptx',
      route: '/pdf',
      name: 'PDF to PPTX',
      description: 'Convert PDF pages into PowerPoint slides.',
      icon: '📄',
    },
    {
      id: 'pptx-to-pdf',
      route: '/pptxtopdf',
      name: 'PPTX to PDF',
      description: 'Convert PowerPoint slides into a PDF.',
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
      description: 'Extract text and GPS data from slides.',
      icon: '🔍',
    }
  ]

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', animation: 'rise 0.4s ease-out' }}>
      <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: '8px', color: 'var(--foreground)' }}>Home</h1>
      <p style={{ color: 'var(--muted-foreground)', marginBottom: '32px' }}>Select a tool to open it in a new tab.</p>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '24px'
      }}>
        {tools.map(tool => (
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
              padding: '24px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{tool.icon}</div>
            <h2 style={{ fontSize: 'var(--text-base)', margin: 0, color: 'var(--foreground)' }}>{tool.name}</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted-foreground)' }}>{tool.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
