import React, { useState } from 'react'
import { ReportSwitcher } from './ReportSwitcher'
import { PhotoAlbumModal } from './PhotoAlbumModal'

export function ReportHeader({
  template,
  currentRoute,
  ROUTES,
  designerMode = 'design',
  slideCount,
  incompletePairCount,
  isImporting,
  isGenerating,
  isGeneratingCompleted,
  isExportingZip,
  canDownload,
  canDownloadCompleted,
  canExportZip,
  pptxInputRef,
  handlePptxButtonClick,
  handlePptxUpload,
  handleClearStored,
  handleDownloadCompleted,
  handleExportRemainingPics,
  handleSaveReportDirect,
  handleDownload,
  onSelectReport,
  hasImportedFile = false,
  importedFileName = '',
  onInsertPhotoAlbum,
  slotKeys = ['beforeImage', 'afterImage'],
}) {
  const [isAlbumModalOpen, setIsAlbumModalOpen] = useState(false)

  const isStandardReportRoute =
    currentRoute === ROUTES.clean ||
    currentRoute === ROUTES.compliance ||
    currentRoute === ROUTES.desilting ||
    currentRoute === ROUTES.dailyPlot

  const showActionButtons =
    isStandardReportRoute || (currentRoute === ROUTES.master && designerMode === 'use')

  return (
    <header className="app__header">
      <div>
        {isStandardReportRoute && (
          <ReportSwitcher
            currentRoute={currentRoute}
            onSelectReport={onSelectReport}
          />
        )}
        <p className="app__eyebrow">{template.eyebrow}</p>
        <h1>{template.title}</h1>
        <p className="app__subtext">{template.subtext}</p>
      </div>

      <div className="app__actions">
        {showActionButtons && (
          <>
            <div className="app__badge">Slides ready: {slideCount}</div>
            <button
              type="button"
              className="button button--secondary"
              style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', color: '#fff', borderColor: 'transparent' }}
              onClick={() => setIsAlbumModalOpen(true)}
              disabled={isImporting || isGenerating}
              title="Bulk upload multiple photos and auto-distribute per slide"
            >
              📸 Photo Album
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={handlePptxButtonClick}
              disabled={isImporting}
            >
              {isImporting ? 'Importing...' : 'Upload PPTX'}
            </button>
            <button type="button" className="ghost" onClick={handleClearStored}>
              Clear Saved
            </button>
            <input
              ref={pptxInputRef}
              className="file-input"
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={handlePptxUpload}
            />
            <button
              type="button"
              className="button button--completed"
              onClick={handleDownloadCompleted}
              disabled={!canDownloadCompleted}
              title={`Export only the ${slideCount} complete slide(s) as PPTX`}
            >
              {isGeneratingCompleted ? 'Building...' : `✅ Completed (${slideCount})`}
            </button>
            <button
              type="button"
              className="button button--zip"
              onClick={handleExportRemainingPics}
              disabled={!canExportZip}
              title={`Export images from ${incompletePairCount} incomplete slide(s) as ZIP`}
            >
              {isExportingZip ? 'Zipping...' : `📦 Remaining Pics (${incompletePairCount})`}
            </button>
            <button
              type="button"
              className="button"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', borderColor: 'transparent', color: '#fff' }}
              onClick={() => handleSaveReportDirect(false)}
              disabled={!canDownload}
              title={hasImportedFile
                ? `Save report directly back to "${importedFileName}" on disk — no dialog`
                : 'Save report directly to file on disk'}
            >
              {isGenerating
                ? 'Building...'
                : hasImportedFile
                  ? `💾 Save to "${importedFileName}"`
                  : '💾 Save File'}
            </button>
            {hasImportedFile && (
              <button
                type="button"
                className="button"
                style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', borderColor: 'transparent', color: '#fff' }}
                onClick={() => handleSaveReportDirect(true)}
                disabled={!canDownload || isGenerating}
                title="Save a copy of the report to a new location via file picker"
              >
                💾 Save As...
              </button>
            )}
            <button
              type="button"
              className="button"
              onClick={handleDownload}
              disabled={!canDownload}
              title="Download a separate copy file via browser"
            >
              {isGenerating ? 'Building PPTX...' : '⬇️ Download Report'}
            </button>

            <PhotoAlbumModal
              isOpen={isAlbumModalOpen}
              onClose={() => setIsAlbumModalOpen(false)}
              onInsert={(images, count, mode) => {
                if (onInsertPhotoAlbum) {
                  onInsertPhotoAlbum(images, count, mode)
                }
              }}
              slotKeys={slotKeys}
              slots={template?.slots || []}
              templateTitle={template?.title || 'Template'}
            />
          </>
        )}
      </div>
    </header>
  )
}

export default ReportHeader
