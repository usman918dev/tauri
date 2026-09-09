import { TEMPLATES, DESILTING_PRESET_TEXT } from '../config/templates'
import { ROUTES } from '../config/routes'

export const EMPTY_PAIR = {
  beforeImage: '',
  middleImage: '',
  afterImage: '',
  slideText: '',
}

export const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

export const extractDroppedImage = async (event) => {
  if (!event || !event.dataTransfer) return null
  const dt = event.dataTransfer

  // 1. Files array (local OS drop, file explorer, WhatsApp desktop attachment)
  if (dt.files && dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      const file = dt.files[i]
      if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|jfif|tiff?)$/i.test(file.name)) {
        return file
      }
    }
    if (dt.files[0] && (dt.files[0].size > 0 || dt.files[0].type)) {
      return dt.files[0]
    }
  }

  // 2. DataTransfer items (WhatsApp Web, browser dragged image elements, clipboard items)
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i]
      if (item.kind === 'file' || (item.type && item.type.startsWith('image/'))) {
        const file = item.getAsFile()
        if (file) return file
      }
    }
  }

  // 3. URI list / URL / HTML (WhatsApp Web, web browser images, blob URLs)
  const uriList = dt.getData('text/uri-list') || dt.getData('URL')
  if (uriList) {
    const urls = uriList.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean)
    for (const url of urls) {
      if (/^(https?|blob|data):/i.test(url)) {
        return url
      }
    }
  }

  const html = dt.getData('text/html')
  if (html) {
    const match = html.match(/src=["']((?:https?|blob|data:image)[^"']+)["']/i) || html.match(/src=["']([^"']+)["']/i)
    if (match && match[1]) {
      return match[1]
    }
  }

  const plainText = dt.getData('text/plain')
  if (plainText) {
    const trimmed = plainText.trim()
    if (/^(https?|blob|data):/i.test(trimmed)) {
      return trimmed
    }
  }

  return null
}

export const getDroppedImageAsDataUrl = async (event) => {
  const result = await extractDroppedImage(event)
  if (!result) return null

  if (typeof result === 'string') {
    if (result.startsWith('data:image/')) {
      return result
    }
    try {
      const response = await fetch(result, { mode: 'cors' })
      const blob = await response.blob()
      return await readFileAsDataUrl(blob)
    } catch (err) {
      console.warn('Could not fetch image URL directly, using raw URL fallback:', err)
      return result
    }
  }

  try {
    return await readFileAsDataUrl(result)
  } catch (err) {
    console.error('Failed to read dropped file as Data URL:', err)
    return null
  }
}

export const hasPairContent = (pair, { slotKeys = [] } = {}) => {
  if (!pair) {
    return false
  }
  const hasImages = Array.isArray(slotKeys) && slotKeys.some((key) => Boolean(pair?.[key]))
  const hasText = typeof pair?.slideText === 'string' && Boolean(pair.slideText.trim())
  const hasCustomFields = Object.keys(pair).some((key) => {
    if (key === 'slideText' || (Array.isArray(slotKeys) && slotKeys.includes(key))) return false
    return typeof pair[key] === 'string' && Boolean(pair[key].trim())
  })
  return hasImages || hasText || hasCustomFields
}

export const trimTrailingEmptyPairs = (pairs, { slotKeys, requiresText }) => {
  const trimmed = [...pairs]
  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1]
    if (hasPairContent(last, { slotKeys, requiresText })) {
      break
    }
    trimmed.pop()
  }
  return trimmed
}

export const buildEmptyPair = (slotKeys, textDefault = '') => {
  const emptyPair = {
    ...EMPTY_PAIR,
    slideText: textDefault,
  }
  slotKeys.forEach((key) => {
    emptyPair[key] = ''
  })
  return emptyPair
}

export const buildPresetPairs = (template, { slotKeys, textDefault }) => {
  if (template?.masterTitle !== TEMPLATES[ROUTES.desilting]?.masterTitle) {
    return null
  }
  const base = buildEmptyPair(slotKeys, textDefault)
  const presets = DESILTING_PRESET_TEXT.map((label) => ({
    ...base,
    slideText: label,
  }))
  return presets
}

export const mergeDesiltingPresetPairs = (pairs, { slotKeys, textDefault }) => {
  const base = buildEmptyPair(slotKeys, textDefault)
  const existing = Array.isArray(pairs) ? pairs : []
  const next = DESILTING_PRESET_TEXT.map((label, index) => {
    const pair = existing[index] || base
    const hasText =
      typeof pair?.slideText === 'string' && pair.slideText.trim()
    return {
      ...base,
      ...pair,
      slideText: hasText ? pair.slideText : label,
    }
  })

  if (existing.length > DESILTING_PRESET_TEXT.length) {
    next.push(
      ...existing
        .slice(DESILTING_PRESET_TEXT.length)
        .filter(Boolean)
        .map((pair) => ({ ...base, ...pair })),
    )
  }

  return next
}

export const resolvePairsSource = ({
  storedPairs,
  data,
  template,
  slotKeys,
  textDefault,
  requiresText,
}) => {
  const isDesilting =
    template?.masterTitle === TEMPLATES[ROUTES.desilting]?.masterTitle
  const hasAnyContent = (pairs) =>
    Array.isArray(pairs) &&
    pairs.some((pair) => hasPairContent(pair, { slotKeys, requiresText }))

  let source = null
  if (storedPairs !== null) {
    if (!isDesilting || hasAnyContent(storedPairs)) {
      source = storedPairs
    }
  }
  if (!source && Array.isArray(data) && data.length > 0) {
    source = data
  }
  if (!source) {
    const presetPairs = buildPresetPairs(template, { slotKeys, textDefault })
    source = presetPairs || []
  }
  return isDesilting
    ? mergeDesiltingPresetPairs(source, { slotKeys, textDefault })
    : source
}

export const isPairComplete = (pair, { slotKeys, requiresText }) => {
  if (!pair) {
    return false
  }
  const hasAllImages = slotKeys.every((key) => Boolean(pair?.[key]))
  if (!hasAllImages) {
    return false
  }
  if (!requiresText) {
    return true
  }
  const textValue = typeof pair?.slideText === 'string' ? pair.slideText.trim() : ''
  return Boolean(textValue)
}

export const getMovableCount = (pairs = [], { slotKeys, requiresText }) => {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return 0
  }
  const lastIndex = pairs.length - 1
  const lastIsEmpty =
    lastIndex >= 0 &&
    !hasPairContent(pairs[lastIndex], { slotKeys, requiresText })
  return lastIsEmpty ? lastIndex : pairs.length
}

export const normalizePairs = (
  items = [],
  { slotKeys = ['beforeImage', 'afterImage'], requiresText = false, textDefault = '' } = {},
) => {
  const emptyPair = buildEmptyPair(slotKeys, textDefault)
  const basePairs = items
    .filter(Boolean)
    .map((pair) => {
      const migratedPair = { ...pair }
      Object.keys(pair).forEach((key) => {
        if (key.startsWith('image_image_')) {
          const newKey = key.replace('image_image_', 'image_')
          migratedPair[newKey] = pair[key]
        }
        if (key.startsWith('text_text_')) {
          const newKey = key.replace('text_text_', 'text_')
          migratedPair[newKey] = pair[key]
        }
        if (key.startsWith('first_image_image_')) {
          const newKey = key.replace('first_image_image_', 'first_image_')
          migratedPair[newKey] = pair[key]
        }
        if (key.startsWith('first_text_text_')) {
          const newKey = key.replace('first_text_text_', 'first_text_')
          migratedPair[newKey] = pair[key]
        }
        if (key.startsWith('last_image_image_')) {
          const newKey = key.replace('last_image_image_', 'last_image_')
          migratedPair[newKey] = pair[key]
        }
        if (key.startsWith('last_text_text_')) {
          const newKey = key.replace('last_text_text_', 'last_text_')
          migratedPair[newKey] = pair[key]
        }
      })
      return {
        ...emptyPair,
        ...migratedPair,
        slideText:
          typeof pair?.slideText === 'string' ? pair.slideText : textDefault,
      }
    })

  if (basePairs.length === 0) {
    return [{ ...emptyPair }]
  }

  const lastPair = basePairs[basePairs.length - 1]
  if (isPairComplete(lastPair, { slotKeys, requiresText })) {
    basePairs.push({ ...emptyPair })
  }

  return basePairs
}
