import JSZip from 'jszip'
import { applyEditsToSlideXml } from './importPptx'

const EMU_PER_INCH = 914400
const DEFAULT_SLIDE_SIZE = { cx: 12192000, cy: 6858000 }
const MAX_BACKGROUND_RATIO = 0.9

const SCHEME_COLOR_MAP = {
  dk1: '000000', tx1: '000000',
  lt1: 'FFFFFF', bg1: 'FFFFFF',
  dk2: '1F3864', tx2: '1F3864',
  lt2: 'D9E2F3', bg2: 'D9E2F3',
  accent1: '4472C4',
  accent2: 'ED7D31',
  accent3: 'A9D18E',
  accent4: 'FFC000',
  accent5: '5A96D6',
  accent6: '70AD47',
  hlink: '0563C1',
  folHlink: '954F72',
}

const parseXml = (xmlText) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Unable to parse PPTX XML data.')
  }
  return doc
}

const getFirstTag = (node, names) => {
  for (const name of names) {
    const list = node.getElementsByTagName(name)
    if (list.length > 0) {
      return list[0]
    }
  }
  return null
}

export const getNodesByLocalName = (parent, localName) => {
  if (!parent) return []
  const all = parent.getElementsByTagName('*')
  const matched = []
  const targetLower = localName.toLowerCase()
  for (let i = 0; i < all.length; i++) {
    const node = all[i]
    const name = (node.localName || node.nodeName || '').toLowerCase()
    if (name === targetLower || name.endsWith(':' + targetLower)) {
      matched.push(node)
    }
  }
  return matched
}

export const extractTextFromShape = (spNode) => {
  if (!spNode) return ''
  const pNodes = getNodesByLocalName(spNode, 'p')
  if (pNodes.length > 0) {
    const pTexts = pNodes.map((p) => {
      const allElems = p.getElementsByTagName('*')
      let str = ''
      for (let i = 0; i < allElems.length; i++) {
        const el = allElems[i]
        const name = (el.localName || el.nodeName || '').toLowerCase()
        if (name === 't' || name.endsWith(':t')) {
          str += el.textContent || ''
        } else if (name === 'br' || name.endsWith(':br')) {
          str += '\n'
        }
      }
      return str
    }).filter((t) => t.length > 0)
    return pTexts.join('\n').trim()
  }

  const tNodes = getNodesByLocalName(spNode, 't')
  return tNodes.map((t) => t.textContent || '').join('\n').trim()
}

const resolveSolidFillColor = (solidFillEl) => {
  if (!solidFillEl) return ''
  const srgb = solidFillEl.getElementsByTagName('a:srgbClr')[0]
  if (srgb) return srgb.getAttribute('val') || ''
  const scheme = solidFillEl.getElementsByTagName('a:schemeClr')[0]
  if (scheme) return SCHEME_COLOR_MAP[scheme.getAttribute('val') || ''] || ''
  return ''
}

const getSlideSize = async (zip) => {
  const file = zip.file('ppt/presentation.xml')
  if (!file) return { ...DEFAULT_SLIDE_SIZE }
  try {
    const doc = parseXml(await file.async('text'))
    const sizeNode =
      doc.getElementsByTagName('p:sldSz')[0] || doc.getElementsByTagName('sldSz')[0]
    if (!sizeNode) return { ...DEFAULT_SLIDE_SIZE }
    const cx = Number(sizeNode.getAttribute('cx') || DEFAULT_SLIDE_SIZE.cx)
    const cy = Number(sizeNode.getAttribute('cy') || DEFAULT_SLIDE_SIZE.cy)
    return { cx, cy }
  } catch {
    return { ...DEFAULT_SLIDE_SIZE }
  }
}

const getSlidePaths = (zip) => {
  const slideRegex = /^ppt\/slides\/slide(\d+)\.xml$/i
  const slides = []
  zip.forEach((relativePath) => {
    const match = slideRegex.exec(relativePath)
    if (match) {
      slides.push({ path: relativePath, index: Number(match[1]) })
    }
  })
  slides.sort((a, b) => a.index - b.index)
  return slides.map((item) => item.path)
}

const getSlideRelsPath = (slidePath) =>
  `${slidePath.replace('ppt/slides/slide', 'ppt/slides/_rels/slide')}.rels`

const normalizeTarget = (target) => {
  let cleaned = target.replace(/^\.\//, '')
  if (cleaned.startsWith('../')) {
    cleaned = cleaned.replace(/^\.\.\//, '')
  }
  cleaned = cleaned.replace(/^\/+/, '')
  if (cleaned.startsWith('ppt/')) return cleaned
  return `ppt/${cleaned}`
}

const getSlideRelations = async (zip, relsPath) => {
  const relsFile = zip.file(relsPath)
  if (!relsFile) return new Map()
  try {
    const doc = parseXml(await relsFile.async('text'))
    const nodes = Array.from(doc.getElementsByTagName('Relationship'))
    const map = new Map()
    nodes.forEach((node) => {
      const id = node.getAttribute('Id')
      const target = node.getAttribute('Target')
      const type = node.getAttribute('Type')
      if (!id || !target) return
      if (type && !/image/i.test(type)) return
      map.set(id, normalizeTarget(target))
    })
    return map
  } catch {
    return new Map()
  }
}

const getMimeType = (path) => {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'image/jpeg'
}

const getImageDataUrl = async (zip, imagePath, cache) => {
  if (!imagePath) return ''
  if (cache.has(imagePath)) return cache.get(imagePath)
  const file = zip.file(imagePath)
  if (!file) return ''
  try {
    const base64 = await file.async('base64')
    const dataUrl = `data:${getMimeType(imagePath)};base64,${base64}`
    cache.set(imagePath, dataUrl)
    return dataUrl
  } catch {
    return ''
  }
}

/**
 * Extract Tables from a slide XML document
 */
const getTablesFromSlide = (slideDoc, slideSize) => {
  const frameNodes = Array.from(
    slideDoc.getElementsByTagName('p:graphicFrame').length
      ? slideDoc.getElementsByTagName('p:graphicFrame')
      : slideDoc.getElementsByTagName('graphicFrame'),
  )
  const results = []

  for (const frame of frameNodes) {
    const tbl =
      frame.getElementsByTagName('a:tbl')[0] ||
      frame.getElementsByTagName('tbl')[0]
    if (!tbl) continue

    const xfrm = getFirstTag(frame, ['p:xfrm', 'a:xfrm', 'xfrm'])
    const off = xfrm ? getFirstTag(xfrm, ['a:off', 'off']) : null
    const ext = xfrm ? getFirstTag(xfrm, ['a:ext', 'ext']) : null

    const xEmu = Number(off?.getAttribute('x') || 0)
    const yEmu = Number(off?.getAttribute('y') || 0)
    const cxEmu = Number(ext?.getAttribute('cx') || 0)
    const cyEmu = Number(ext?.getAttribute('cy') || 0)

    const slideWidthInch = slideSize.cx / EMU_PER_INCH

    const trNodes = Array.from(
      tbl.getElementsByTagName('a:tr').length
        ? tbl.getElementsByTagName('a:tr')
        : tbl.getElementsByTagName('tr'),
    )

    const rows = trNodes.map((tr) => {
      const tcNodes = Array.from(
        tr.getElementsByTagName('a:tc').length
          ? tr.getElementsByTagName('a:tc')
          : tr.getElementsByTagName('tc'),
      )
      return tcNodes.map((tc) => {
        const tNodes = Array.from(
          tc.getElementsByTagName('a:t').length
            ? tc.getElementsByTagName('a:t')
            : tc.getElementsByTagName('t'),
        )
        const text = tNodes.map((t) => t.textContent || '').join('')

        const rPr =
          tc.getElementsByTagName('a:rPr')[0] ||
          tc.getElementsByTagName('rPr')[0]
        const bold = rPr?.getAttribute('b') === '1'
        const sz = rPr ? Number(rPr.getAttribute('sz') || 0) : 0
        const ptSize = sz > 0 ? sz / 100 : 11
        const fontSizePct = (ptSize / 72 / slideWidthInch) * 100

        let fontFace = 'Calibri'
        if (rPr) {
          const latin = rPr.getElementsByTagName('a:latin')[0]
          if (latin) fontFace = latin.getAttribute('typeface') || 'Calibri'
        }

        const color = rPr ? resolveSolidFillColor(rPr.getElementsByTagName('a:solidFill')[0]) : ''

        const pPr =
          tc.getElementsByTagName('a:pPr')[0] ||
          tc.getElementsByTagName('pPr')[0]
        const algn = pPr?.getAttribute('algn') || 'l'
        const alignMap = { l: 'left', ctr: 'center', r: 'right', just: 'justify' }

        const tcPr =
          tc.getElementsByTagName('a:tcPr')[0] ||
          tc.getElementsByTagName('tcPr')[0]

        const fillColor = resolveSolidFillColor(
          tcPr?.getElementsByTagName('a:solidFill')[0] ?? null
        )

        let borderColor = 'cccccc'
        if (tcPr) {
          const lnEl =
            tcPr.getElementsByTagName('a:lnL')[0] ||
            tcPr.getElementsByTagName('a:lnT')[0]
          const resolved = resolveSolidFillColor(
            lnEl?.getElementsByTagName('a:solidFill')[0] ?? null
          )
          if (resolved) borderColor = resolved
        }

        return {
          text,
          bold,
          fontSizePct,
          color,
          fontFace,
          align: alignMap[algn] || 'left',
          fillColor,
          borderColor,
        }
      })
    })

    results.push({
      id: `tbl_${xEmu}_${yEmu}`,
      type: 'table',
      tagName: '<a:tbl> Table',
      xEmu,
      yEmu,
      cxEmu,
      cyEmu,
      xInch: xEmu / EMU_PER_INCH,
      yInch: yEmu / EMU_PER_INCH,
      wInch: cxEmu / EMU_PER_INCH,
      hInch: cyEmu / EMU_PER_INCH,
      xPct: (xEmu / slideSize.cx) * 100,
      yPct: (yEmu / slideSize.cy) * 100,
      wPct: (cxEmu / slideSize.cx) * 100,
      hPct: (cyEmu / slideSize.cy) * 100,
      fontSizePct: ((11 / 72) / slideWidthInch) * 100,
      rows,
    })
  }

  return results
}

/**
 * Parse entire PPTX presentation into full editable slide representations.
 */
export const parsePptxForEditing = async (file) => {
  if (!file) return null

  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const slidePaths = getSlidePaths(zip)
  const slideSize = await getSlideSize(zip)
  const imageCache = new Map()

  const slideAreaEmu = slideSize.cx * slideSize.cy
  const maxBgAreaEmu = slideAreaEmu * MAX_BACKGROUND_RATIO

  const slides = []

  for (let idx = 0; idx < slidePaths.length; idx++) {
    const slidePath = slidePaths[idx]
    const slideFile = zip.file(slidePath)
    if (!slideFile) continue

    const slideXmlText = await slideFile.async('text')
    const slideDoc = parseXml(slideXmlText)
    const relsPath = getSlideRelsPath(slidePath)
    const relMap = await getSlideRelations(zip, relsPath)

    const elements = []

    // 1. Extract Pictures (<p:pic>)
    const picNodes = Array.from(
      slideDoc.getElementsByTagName('p:pic').length
        ? slideDoc.getElementsByTagName('p:pic')
        : slideDoc.getElementsByTagName('pic'),
    )

    let backgroundDataUrl = ''
    const contentPics = []

    // 1a. Check explicit <p:bg> element on slide
    const bgNode = getFirstTag(slideDoc, ['p:bg', 'bg'])
    if (bgNode) {
      const blip = getFirstTag(bgNode, ['a:blip', 'blip'])
      const embed = blip?.getAttribute('r:embed') || blip?.getAttribute('embed') || ''
      const target = embed ? relMap.get(embed) : ''
      if (target) {
        backgroundDataUrl = await getImageDataUrl(zip, target, imageCache)
      }
    }

    // 1b. Extract Pictures (<p:pic>)
    for (let pIdx = 0; pIdx < picNodes.length; pIdx++) {
      const pic = picNodes[pIdx]
      const blip = getFirstTag(pic, ['a:blip', 'blip'])
      const embed = blip?.getAttribute('r:embed') || blip?.getAttribute('embed') || ''
      const target = embed ? relMap.get(embed) : ''

      const xfrm = getFirstTag(pic, ['p:xfrm', 'a:xfrm', 'xfrm'])
      const off = xfrm ? getFirstTag(xfrm, ['a:off', 'off']) : null
      const ext = xfrm ? getFirstTag(xfrm, ['a:ext', 'ext']) : null

      const xEmu = Number(off?.getAttribute('x') || 0)
      const yEmu = Number(off?.getAttribute('y') || 0)
      const cxEmu = Number(ext?.getAttribute('cx') || 0)
      const cyEmu = Number(ext?.getAttribute('cy') || 0)
      const areaEmu = cxEmu * cyEmu

      const dataUrl = target ? await getImageDataUrl(zip, target, imageCache) : ''

      if (areaEmu >= maxBgAreaEmu && !backgroundDataUrl) {
        backgroundDataUrl = dataUrl
      } else {
        contentPics.push({
          pic,
          pIdx,
          embed,
          target,
          dataUrl,
          xEmu,
          yEmu,
          cxEmu,
          cyEmu,
        })
      }
    }

    contentPics.forEach(({ pIdx, embed, target, dataUrl, xEmu, yEmu, cxEmu, cyEmu }) => {
      elements.push({
        id: `slide_${idx + 1}_pic_${pIdx}`,
        picIndex: pIdx,
        type: 'image',
        tagName: '<p:pic> Image',
        embed,
        target,
        dataUrl,
        originalDataUrl: dataUrl,
        xEmu,
        yEmu,
        cxEmu,
        cyEmu,
        xInch: xEmu / EMU_PER_INCH,
        yInch: yEmu / EMU_PER_INCH,
        wInch: cxEmu / EMU_PER_INCH,
        hInch: cyEmu / EMU_PER_INCH,
        xPct: (xEmu / slideSize.cx) * 100,
        yPct: (yEmu / slideSize.cy) * 100,
        wPct: (cxEmu / slideSize.cx) * 100,
        hPct: (cyEmu / slideSize.cy) * 100,
      })
    })

    // 2. Extract Text Shapes (<p:sp>)
    const spNodes = Array.from(
      slideDoc.getElementsByTagName('p:sp').length
        ? slideDoc.getElementsByTagName('p:sp')
        : slideDoc.getElementsByTagName('sp'),
    )

    for (let sIdx = 0; sIdx < spNodes.length; sIdx++) {
      const sp = spNodes[sIdx]

      const xfrm = getFirstTag(sp, ['p:xfrm', 'a:xfrm', 'xfrm'])
      const off = xfrm ? getFirstTag(xfrm, ['a:off', 'off']) : null
      const ext = xfrm ? getFirstTag(xfrm, ['a:ext', 'ext']) : null

      const xEmu = Number(off?.getAttribute('x') || 0)
      const yEmu = Number(off?.getAttribute('y') || 0)
      const cxEmu = Number(ext?.getAttribute('cx') || 0)
      const cyEmu = Number(ext?.getAttribute('cy') || 0)
      const areaEmu = cxEmu * cyEmu

      if (areaEmu >= maxBgAreaEmu) continue

      const text = extractTextFromShape(sp)

      if (!text) continue

      const rPr = sp.getElementsByTagName('a:rPr')[0] || sp.getElementsByTagName('rPr')[0]
      const bold = rPr?.getAttribute('b') === '1'
      const sz = rPr ? Number(rPr.getAttribute('sz') || 0) : 0
      const ptSize = sz > 0 ? sz / 100 : 14
      const fontSizePct = Math.max(ptSize * 0.104, 0.8)

      let fontFace = 'Calibri'
      if (rPr) {
        const latin = rPr.getElementsByTagName('a:latin')[0]
        if (latin) fontFace = latin.getAttribute('typeface') || 'Calibri'
      }

      const color = rPr ? resolveSolidFillColor(rPr.getElementsByTagName('a:solidFill')[0]) : ''

      const pPr = sp.getElementsByTagName('a:pPr')[0] || sp.getElementsByTagName('pPr')[0]
      const algn = pPr?.getAttribute('algn') || 'l'
      const alignMap = { l: 'left', ctr: 'center', r: 'right', just: 'justify' }

      const nvSpPr = getFirstTag(sp, ['p:nvSpPr', 'nvSpPr'])
      const nvPr = nvSpPr ? getFirstTag(nvSpPr, ['p:nvPr', 'nvPr']) : null
      const ph = nvPr ? getFirstTag(nvPr, ['p:ph', 'ph']) : null
      const phType = ph ? ph.getAttribute('type') || 'body' : 'body'
      const isTitle = phType.includes('title') || phType === 'ctrTitle' || sIdx === 0

      elements.push({
        id: `slide_${idx + 1}_text_${sIdx}`,
        spIndex: sIdx,
        type: 'text',
        tagName: isTitle ? '<p:sp> Title' : '<p:sp> Text',
        text,
        originalText: text,
        fontFace,
        fontSizePct,
        bold,
        color,
        align: alignMap[algn] || 'left',
        isTitle,
        phType,
        xEmu,
        yEmu,
        cxEmu,
        cyEmu,
        xInch: xEmu / EMU_PER_INCH,
        yInch: yEmu / EMU_PER_INCH,
        wInch: cxEmu / EMU_PER_INCH,
        hInch: cyEmu / EMU_PER_INCH,
        xPct: (xEmu / slideSize.cx) * 100,
        yPct: (yEmu / slideSize.cy) * 100,
        wPct: (cxEmu / slideSize.cx) * 100,
        hPct: (cyEmu / slideSize.cy) * 100,
      })
    }

    // 3. Extract Tables (<a:tbl>)
    const tables = getTablesFromSlide(slideDoc, slideSize)
    elements.push(...tables)

    // Determine slide title
    const titleElem = elements.find((e) => e.type === 'text' && e.isTitle) || elements.find((e) => e.type === 'text')
    const slideTitle = titleElem ? titleElem.text.slice(0, 40) : `Slide ${idx + 1}`

    slides.push({
      id: `slide_${idx + 1}_${Date.now()}_${idx}`,
      slideNumber: idx + 1,
      title: slideTitle,
      xmlPath: slidePath,
      relsPath,
      elements,
      backgroundDataUrl,
      rawXml: slideXmlText,
    })
  }

  return {
    filename: file.name,
    slides,
    slideSize: {
      cx: slideSize.cx,
      cy: slideSize.cy,
      wInch: slideSize.cx / EMU_PER_INCH,
      hInch: slideSize.cy / EMU_PER_INCH,
    },
  }
}




/**
 * Re-compiles edited presentation and triggers browser save/download.
 * Supports Native File System Access API for direct 1-click file overwrite.
 * Handles deletion of elements (text/image/table) and deleted slides.
 */
export const exportEditedPptx = async (originalFile, slidesData, options = {}) => {
  const { download = true, fileHandle = null, saveAs = false, outputFileName = '' } =
    typeof options === 'string' ? { outputFileName: options } : options

  if (!originalFile || !slidesData || !slidesData.length) return null

  const arrayBuffer = await originalFile.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const originalSlidePaths = getSlidePaths(zip)

  const parser = new DOMParser()
  const serializer = new XMLSerializer()

  // ── Helper: physically remove XML nodes for deleted elements ──────────────
  const removeDeletedElements = (xmlText, slide) => {
    if (!slide.elements) return xmlText

    const keepTextIndices = new Set(
      slide.elements.filter((e) => e.type === 'text' && e.spIndex != null).map((e) => e.spIndex)
    )
    const keepPicIndices = new Set(
      slide.elements.filter((e) => e.type === 'image' && e.picIndex != null).map((e) => e.picIndex)
    )
    const hasIndexedTexts = slide.elements.some((e) => e.type === 'text' && e.spIndex != null)
    const hasIndexedPics = slide.elements.some((e) => e.type === 'image' && e.picIndex != null)

    const doc = parser.parseFromString(xmlText, 'application/xml')
    if (doc.getElementsByTagName('parsererror').length > 0) return xmlText

    // Remove deleted <p:sp> (text shapes) by spIndex
    if (hasIndexedTexts) {
      const spNodes = Array.from(
        doc.getElementsByTagName('p:sp').length
          ? doc.getElementsByTagName('p:sp')
          : doc.getElementsByTagName('sp')
      )
      spNodes.forEach((sp, sIdx) => {
        if (!keepTextIndices.has(sIdx)) {
          sp.parentNode?.removeChild(sp)
        }
      })
    }

    // Remove deleted <p:pic> (images) by picIndex
    if (hasIndexedPics) {
      const picNodes = Array.from(
        doc.getElementsByTagName('p:pic').length
          ? doc.getElementsByTagName('p:pic')
          : doc.getElementsByTagName('pic')
      )
      picNodes.forEach((pic, pIdx) => {
        if (!keepPicIndices.has(pIdx)) {
          pic.parentNode?.removeChild(pic)
        }
      })
    }

    // Remove deleted <p:graphicFrame> (tables) — identify by x/y position-based id
    const keepTableIds = new Set(
      slide.elements.filter((e) => e.type === 'table').map((e) => e.id)
    )
    const framesToCheck = []
    const frameTagNames = ['p:graphicFrame', 'graphicFrame']
    for (const tagName of frameTagNames) {
      const nodes = Array.from(doc.getElementsByTagName(tagName))
      if (nodes.length === 0) continue
      nodes.forEach((frame) => {
        const tbl = frame.getElementsByTagName('a:tbl')[0] || frame.getElementsByTagName('tbl')[0]
        if (!tbl) return
        const xfrm = frame.getElementsByTagName('p:xfrm')[0] || frame.getElementsByTagName('xfrm')[0]
        const off = xfrm?.getElementsByTagName('a:off')[0] || xfrm?.getElementsByTagName('off')[0]
        const x = off?.getAttribute('x') || '0'
        const y = off?.getAttribute('y') || '0'
        framesToCheck.push({ frame, computedId: `tbl_${x}_${y}` })
      })
      break
    }
    framesToCheck.forEach(({ frame, computedId }) => {
      if (!keepTableIds.has(computedId)) {
        frame.parentNode?.removeChild(frame)
      }
    })

    let result = serializer.serializeToString(doc)
    if (!result.startsWith('<?xml')) {
      result = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + result
    }
    return result
  }

  // ── Build set of xmlPaths still present in slidesData ────────────────────
  const activeSlidePaths = new Set(slidesData.map((s) => s.xmlPath).filter(Boolean))

  // ── Remove deleted slides from zip, presentation.xml, content types ───────
  const deletedOrigPaths = originalSlidePaths.filter((p) => !activeSlidePaths.has(p))
  if (deletedOrigPaths.length > 0) {
    // 1. Remove slide XML + rels files from zip
    deletedOrigPaths.forEach((path) => {
      zip.remove(path)
      zip.remove(getSlideRelsPath(path))
    })

    // 2. Update ppt/presentation.xml sldIdLst
    const presFile = zip.file('ppt/presentation.xml')
    if (presFile) {
      const presXml = await presFile.async('text')
      const presDoc = parser.parseFromString(presXml, 'application/xml')
      const sldIdLst =
        presDoc.getElementsByTagName('p:sldIdLst')[0] ||
        presDoc.getElementsByTagName('sldIdLst')[0]

      const presRelsFile =
        zip.file('ppt/_rels/presentation.xml.rels') ||
        zip.file('ppt/_rels/Presentation.xml.rels')

      if (sldIdLst && presRelsFile) {
        const presRelsXml = await presRelsFile.async('text')
        const presRelsDoc = parser.parseFromString(presRelsXml, 'application/xml')

        // Build rId → normalizedPath map from presentation rels
        const rIdToPath = new Map()
        Array.from(presRelsDoc.getElementsByTagName('Relationship')).forEach((rel) => {
          const id = rel.getAttribute('Id')
          const target = rel.getAttribute('Target')
          if (id && target) rIdToPath.set(id, normalizeTarget(target))
        })

        const deletedNorm = new Set(deletedOrigPaths.map((p) => normalizeTarget(p)))
        const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

        // Remove sldId nodes whose r:id resolves to a deleted slide path
        const sldIdNodes = Array.from(
          sldIdLst.getElementsByTagName('p:sldId').length
            ? sldIdLst.getElementsByTagName('p:sldId')
            : sldIdLst.getElementsByTagName('sldId')
        )
        const rIdsToRemove = new Set()
        sldIdNodes.forEach((sldId) => {
          const rId = sldId.getAttribute('r:id') || sldId.getAttributeNS(NS_R, 'id')
          const resolvedPath = rId ? rIdToPath.get(rId) : null
          if (resolvedPath && deletedNorm.has(resolvedPath)) {
            sldIdLst.removeChild(sldId)
            rIdsToRemove.add(rId)
          }
        })

        // Remove corresponding rels entries
        rIdsToRemove.forEach((rId) => {
          Array.from(presRelsDoc.getElementsByTagName('Relationship')).forEach((rel) => {
            if (rel.getAttribute('Id') === rId) rel.parentNode?.removeChild(rel)
          })
        })

        let newPresRels = serializer.serializeToString(presRelsDoc)
        if (!newPresRels.startsWith('<?xml')) {
          newPresRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newPresRels
        }
        zip.file(presRelsFile.name || 'ppt/_rels/presentation.xml.rels', newPresRels)
      }

      let newPresXml = serializer.serializeToString(presDoc)
      if (!newPresXml.startsWith('<?xml')) {
        newPresXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newPresXml
      }
      zip.file('ppt/presentation.xml', newPresXml)
    }

    // 3. Remove deleted slides from [Content_Types].xml
    const ctFile = zip.file('[Content_Types].xml')
    if (ctFile) {
      const ctXml = await ctFile.async('text')
      const ctDoc = parser.parseFromString(ctXml, 'application/xml')
      const deletedNormSet = new Set(deletedOrigPaths.map((p) => '/' + p.replace(/^\//, '')))
      Array.from(ctDoc.getElementsByTagName('Override')).forEach((ov) => {
        const partName = ov.getAttribute('PartName') || ''
        if (deletedNormSet.has(partName)) ov.parentNode?.removeChild(ov)
      })
      let newCtXml = serializer.serializeToString(ctDoc)
      if (!newCtXml.startsWith('<?xml')) {
        newCtXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newCtXml
      }
      zip.file('[Content_Types].xml', newCtXml)
    }
  }

  // ── Process each surviving slide ─────────────────────────────────────────
  for (let sIdx = 0; sIdx < slidesData.length; sIdx++) {
    const slide = slidesData[sIdx]
    const origPath = slide.xmlPath || originalSlidePaths[sIdx]
    if (!origPath) continue

    // Resolve exact file key in zip for slide XML
    let zipKey = origPath
    let slideFile = zip.file(origPath)
    if (!slideFile) {
      const lower = origPath.toLowerCase()
      for (const k of Object.keys(zip.files)) {
        if (k.toLowerCase() === lower) {
          zipKey = k
          slideFile = zip.files[k]
          break
        }
      }
    }

    if (!slideFile) continue

    const slideXmlText = await slideFile.async('text')
    const texts = slide.elements ? slide.elements.filter((e) => e.type === 'text') : []
    const tables = slide.elements ? slide.elements.filter((e) => e.type === 'table') : []

    // 1. Remove deleted elements from the XML DOM first
    const xmlAfterDeletion = removeDeletedElements(slideXmlText, slide)

    // 2. Apply text and table edits using raw XML DOM transformer engine
    let updatedXml = applyEditsToSlideXml(xmlAfterDeletion, { texts, tables })

    // 3. Process image replacements and update slide relationships (.rels)
    const relsPath = getSlideRelsPath(zipKey)
    let relsFile = zip.file(relsPath)
    if (!relsFile) {
      const lowerRels = relsPath.toLowerCase()
      for (const k of Object.keys(zip.files)) {
        if (k.toLowerCase() === lowerRels) {
          relsFile = zip.files[k]
          break
        }
      }
    }

    const imageElements = slide.elements ? slide.elements.filter((e) => e.type === 'image') : []

    if (relsFile && imageElements.length > 0) {
      const relsXmlText = await relsFile.async('text')
      const relsDoc = parser.parseFromString(relsXmlText, 'application/xml')
      const relsRoot =
        relsDoc.getElementsByTagName('Relationships')[0] || relsDoc.documentElement

      let maxRId = 100
      Array.from(relsDoc.getElementsByTagName('Relationship')).forEach((rel) => {
        const m = (rel.getAttribute('Id') || '').match(/rId(\d+)/)
        if (m) maxRId = Math.max(maxRId, Number(m[1]))
      })

      let imgCounter = 0
      imageElements.forEach((img) => {
        if (img.dataUrl && img.dataUrl !== img.originalDataUrl) {
          try {
            const b64 = img.dataUrl.replace(/^data:[^;]+;base64,/, '')
            const binary = atob(b64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

            const ext = img.dataUrl.includes('image/png')
              ? 'png'
              : img.dataUrl.includes('image/gif')
              ? 'gif'
              : 'jpg'
            const mediaFileName = `imp_s${sIdx + 1}_${imgCounter++}.${ext}`
            const mediaPath = `ppt/media/${mediaFileName}`
            zip.file(mediaPath, bytes.buffer)

            maxRId++
            const newRId = `rId${maxRId}`

            const relNode = relsDoc.createElementNS(
              'http://schemas.openxmlformats.org/package/2006/relationships',
              'Relationship',
            )
            relNode.setAttribute('Id', newRId)
            relNode.setAttribute(
              'Type',
              'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
            )
            relNode.setAttribute('Target', `../media/${mediaFileName}`)
            relsRoot.appendChild(relNode)

            if (img.embed) {
              updatedXml = updatedXml.replace(
                new RegExp(`\\b(r:embed|r:id|r:link|embed)="${img.embed}"`, 'g'),
                `$1="${newRId}"`,
              )
            }
          } catch (e) {
            console.error('Failed to replace image asset in PPTX rels:', e)
          }
        }
      })

      let newRelsXml = serializer.serializeToString(relsDoc)
      if (!newRelsXml.startsWith('<?xml')) {
        newRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newRelsXml
      }
      zip.file(relsFile.name || relsPath, newRelsXml)
    }

    zip.file(zipKey, updatedXml)
  }

  // Generate updated Blob
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  // 1. Direct overwrite to fileHandle on disk (Native File System Access API)
  if (fileHandle && typeof fileHandle.createWritable === 'function' && !saveAs) {
    try {
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { blob, savedDirectly: true, fileName: fileHandle.name }
    } catch (err) {
      console.warn('Direct file handle write failed or permission denied, falling back:', err)
    }
  }

  // 2. "Save As" file picker on disk
  if (saveAs && typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: outputFileName || originalFile.name,
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
      await writable.write(blob)
      await writable.close()
      return { blob, savedDirectly: true, fileName: handle.name, fileHandle: handle }
    } catch (err) {
      if (err.name === 'AbortError') return null
    }
  }

  // 3. Fallback: standard browser download link
  if (download) {
    const downloadName = outputFileName || `Edited_${originalFile.name}`
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = downloadName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return { blob, savedDirectly: false }
}
