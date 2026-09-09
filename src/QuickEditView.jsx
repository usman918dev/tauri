export function QuickEditView({
  parsedData,
  activeSlideIndex,
  setActiveSlideIndex,
  selectedElementId,
  setSelectedElementId,
  dragOverElemId,
  setDragOverElemId,
  updateElement,
  handleElementImageDrop,
  triggerImageReplacement,
  handleTableCellChange,
  handleAddSlide,
  moveSlide,
  duplicateSlide,
  deleteSlide,
  deleteSelectedElement,
}) {
  const activeSlide = parsedData?.slides?.[activeSlideIndex]
  const selectedElem = activeSlide?.elements?.find((e) => e.id === selectedElementId)

  return (
    <div className="pptx-workbench">
      {/* Left Panel: Slide Deck Sidebar */}
      <aside className="pptx-deck">
        <div className="pptx-deck__header">
          <h3>Slides ({parsedData?.slides?.length || 0})</h3>
          <button
            type="button"
            className="pptx-mini-btn"
            onClick={handleAddSlide}
            title="Add new slide"
          >
            ➕ New
          </button>
        </div>

        <div className="pptx-deck__list">
          {parsedData?.slides?.map((slide, idx) => {
            const isActive = idx === activeSlideIndex
            const textCount = slide.elements.filter((e) => e.type === 'text').length
            const imgCount = slide.elements.filter((e) => e.type === 'image').length
            const tblCount = slide.elements.filter((e) => e.type === 'table').length

            return (
              <div
                key={slide.id}
                className={`pptx-deck__card${isActive ? ' is-active' : ''}`}
                onClick={() => {
                  setActiveSlideIndex(idx)
                  setSelectedElementId(null)
                }}
              >
                <div className="pptx-deck__num">{slide.slideNumber}</div>
                <div className="pptx-deck__thumb">
                  {slide.backgroundDataUrl ? (
                    <img src={slide.backgroundDataUrl} alt="Slide thumb" className="pptx-deck__thumb-bg" />
                  ) : (
                    <div className="pptx-deck__thumb-empty" />
                  )}
                  <span className="pptx-deck__title">{slide.title}</span>
                </div>

                <div className="pptx-deck__badges">
                  {textCount > 0 && <span className="pptx-chip">📝 {textCount}</span>}
                  {imgCount > 0 && <span className="pptx-chip">🖼️ {imgCount}</span>}
                  {tblCount > 0 && <span className="pptx-chip">📊 {tblCount}</span>}
                </div>

                <div className="pptx-deck__controls" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="pptx-icon-btn"
                    disabled={idx === 0}
                    onClick={() => moveSlide(idx, idx - 1)}
                    title="Move Up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="pptx-icon-btn"
                    disabled={idx === parsedData.slides.length - 1}
                    onClick={() => moveSlide(idx, idx + 1)}
                    title="Move Down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="pptx-icon-btn"
                    onClick={() => duplicateSlide(idx)}
                    title="Duplicate"
                  >
                    📋
                  </button>
                  <button
                    type="button"
                    className="pptx-icon-btn pptx-icon-btn--danger"
                    onClick={() => deleteSlide(idx)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {/* Center Stage: Interactive 16:9 Slide Canvas */}
      <main className="pptx-stage">
        <div className="pptx-stage__bar">
          <div className="pptx-stage__info">
            <span>Slide {activeSlide?.slideNumber} of {parsedData?.slides?.length || 0}</span>
            <span className="pptx-stage__divider">•</span>
            <span>{activeSlide?.title}</span>
          </div>
          <span className="pptx-stage__hint">
            💡 Double-click text to edit • Drag & drop images onto slots to replace
          </span>
        </div>

        <div className="pptx-stage__viewport">
          {activeSlide ? (
            <div
              className="pptx-canvas"
              style={{
                backgroundImage: activeSlide.backgroundDataUrl ? `url(${activeSlide.backgroundDataUrl})` : undefined,
              }}
              onClick={() => setSelectedElementId(null)}
            >
              {activeSlide.elements.map((elem) => {
                const isSelected = selectedElementId === elem.id
                const isDragOver = dragOverElemId === elem.id

                if (elem.type === 'text') {
                  return (
                    <div
                      key={elem.id}
                      className={`pptx-canvas__elem pptx-canvas__text${isSelected ? ' is-selected' : ''}`}
                      style={{
                        left: `${elem.xPct}%`,
                        top: `${elem.yPct}%`,
                        width: `${elem.wPct}%`,
                        height: `${elem.hPct}%`,
                        fontSize: `${elem.fontSizePct || 1.8}cqw`,
                        fontFamily: elem.fontFace || 'Calibri',
                        color: elem.color ? `#${elem.color}` : 'inherit',
                        fontWeight: elem.bold ? 'bold' : 'normal',
                        textAlign: elem.align || 'left',
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedElementId(elem.id)
                      }}
                    >
                      <textarea
                        className="pptx-canvas__text-input"
                        value={elem.text}
                        onChange={(e) => updateElement(elem.id, { text: e.target.value })}
                        placeholder="Enter text..."
                        rows={1}
                        style={{
                          fontSize: 'inherit',
                          fontFamily: 'inherit',
                          color: 'inherit',
                          fontWeight: 'inherit',
                          textAlign: 'inherit',
                        }}
                      />
                    </div>
                  )
                }

                if (elem.type === 'image') {
                  return (
                    <div
                      key={elem.id}
                      className={`pptx-canvas__elem pptx-canvas__img${isSelected ? ' is-selected' : ''}${isDragOver ? ' is-drag-over' : ''}`}
                      style={{
                        left: `${elem.xPct}%`,
                        top: `${elem.yPct}%`,
                        width: `${elem.wPct}%`,
                        height: `${elem.hPct}%`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedElementId(elem.id)
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (e.dataTransfer) {
                          e.dataTransfer.dropEffect = 'copy'
                        }
                        setDragOverElemId(elem.id)
                      }}
                      onDragLeave={() => setDragOverElemId(null)}
                      onDrop={(e) => handleElementImageDrop(e, elem.id)}
                    >
                      {elem.dataUrl ? (
                        <img src={elem.dataUrl} alt="Slide Asset" className="pptx-canvas__img-asset" />
                      ) : (
                        <div className="pptx-canvas__img-placeholder">
                          <span>🖼️ Image Slot</span>
                          <small>Drag & drop or click replace</small>
                        </div>
                      )}

                      <button
                        type="button"
                        className="pptx-canvas__img-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          triggerImageReplacement(elem.id)
                        }}
                        title="Replace Image"
                      >
                        📷 Replace
                      </button>
                    </div>
                  )
                }

                if (elem.type === 'table') {
                  return (
                    <div
                      key={elem.id}
                      className={`pptx-canvas__elem pptx-canvas__table${isSelected ? ' is-selected' : ''}`}
                      style={{
                        left: `${elem.xPct}%`,
                        top: `${elem.yPct}%`,
                        width: `${elem.wPct}%`,
                        height: `${elem.hPct}%`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedElementId(elem.id)
                      }}
                    >
                      <table className="pptx-canvas__tbl-grid">
                        <tbody>
                          {(elem.rows || []).map((row, rIdx) => (
                            <tr key={`r_${rIdx}`}>
                              {row.map((cell, cIdx) => (
                                <td
                                  key={`c_${cIdx}`}
                                  style={{
                                    backgroundColor: cell.fillColor ? `#${cell.fillColor}` : undefined,
                                    borderColor: cell.borderColor ? `#${cell.borderColor}` : '#cccccc',
                                    color: cell.color ? `#${cell.color}` : '#111111',
                                    fontWeight: cell.bold ? 'bold' : 'normal',
                                    fontSize: `${cell.fontSizePct || 1.4}cqw`,
                                    fontFamily: cell.fontFace || 'Calibri',
                                    textAlign: cell.align || 'left',
                                  }}
                                >
                                  <input
                                    type="text"
                                    className="pptx-canvas__tbl-cell-input"
                                    value={cell.text || ''}
                                    onChange={(e) =>
                                      handleTableCellChange(elem.id, rIdx, cIdx, e.target.value)
                                    }
                                    placeholder="..."
                                    style={{
                                      fontSize: 'inherit',
                                      fontFamily: 'inherit',
                                      color: 'inherit',
                                      fontWeight: 'inherit',
                                      textAlign: 'inherit',
                                    }}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                }

                return null
              })}
            </div>
          ) : (
            <div className="pptx-stage__empty">Select a slide to edit</div>
          )}
        </div>
      </main>

      {/* Right Panel: Property Inspector */}
      <aside className="pptx-inspector">
        <div className="pptx-inspector__header">
          <h3>Element Inspector</h3>
          {selectedElem && (
            <button
              type="button"
              className="pptx-mini-btn pptx-mini-btn--danger"
              onClick={deleteSelectedElement}
              title="Delete Selected Element"
            >
              🗑️ Delete
            </button>
          )}
        </div>

        {selectedElem ? (
          <div className="pptx-inspector__body">
            <div className="pptx-inspector__section">
              <span className="pptx-inspector__tag">{selectedElem.tagName}</span>
              <span className="pptx-inspector__id">ID: {selectedElem.id}</span>
            </div>

            {/* Position Controls */}
            <div className="pptx-inspector__section">
              <h4 className="pptx-inspector__title">Position & Size (%)</h4>
              <div className="pptx-inspector__grid">
                <label>
                  <span>Left X</span>
                  <input
                    type="number"
                    value={Math.round(selectedElem.xPct || 0)}
                    onChange={(e) =>
                      updateElement(selectedElem.id, { xPct: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  <span>Top Y</span>
                  <input
                    type="number"
                    value={Math.round(selectedElem.yPct || 0)}
                    onChange={(e) =>
                      updateElement(selectedElem.id, { yPct: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  <span>Width</span>
                  <input
                    type="number"
                    value={Math.round(selectedElem.wPct || 0)}
                    onChange={(e) =>
                      updateElement(selectedElem.id, { wPct: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  <span>Height</span>
                  <input
                    type="number"
                    value={Math.round(selectedElem.hPct || 0)}
                    onChange={(e) =>
                      updateElement(selectedElem.id, { hPct: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
            </div>

            {/* Text Controls */}
            {selectedElem.type === 'text' && (
              <div className="pptx-inspector__section">
                <h4 className="pptx-inspector__title">Text Content</h4>
                <textarea
                  className="pptx-inspector__textarea"
                  rows={5}
                  value={selectedElem.text}
                  onChange={(e) =>
                    updateElement(selectedElem.id, { text: e.target.value })
                  }
                />

                <div className="pptx-inspector__row">
                  <label className="pptx-inspector__checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedElem.bold)}
                      onChange={(e) =>
                        updateElement(selectedElem.id, { bold: e.target.checked })
                      }
                    />
                    <span>Bold</span>
                  </label>

                  <label className="pptx-inspector__field">
                    <span>Align:</span>
                    <select
                      value={selectedElem.align || 'left'}
                      onChange={(e) =>
                        updateElement(selectedElem.id, { align: e.target.value })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            {/* Image Controls */}
            {selectedElem.type === 'image' && (
              <div className="pptx-inspector__section">
                <h4 className="pptx-inspector__title">Image Asset</h4>
                <div className="pptx-inspector__img-box">
                  {selectedElem.dataUrl ? (
                    <img src={selectedElem.dataUrl} alt="Inspector Preview" />
                  ) : (
                    <span>No Image Set</span>
                  )}
                </div>
                <button
                  type="button"
                  className="pptx-editor__btn pptx-editor__btn--small"
                  onClick={() => triggerImageReplacement(selectedElem.id)}
                >
                  📷 Replace Image File
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="pptx-inspector__none">
            Select an element on the slide canvas to inspect and edit properties.
          </div>
        )}
      </aside>
    </div>
  )
}
