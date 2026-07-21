const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3000
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production'

app.use(cors())
app.use(express.json())
app.use((req, _res, next) => {
  console.log(`[request] ${req.method} ${req.url}`)
  next()
})

app.post('/extract-styles', async (req, res) => {
  const { url, forcePlaywright = false, simulateCssFailure = false } = req.body || {}

  if (!url) return res.status(400).json({ error: 'URL required' })

  const fullUrl = url.startsWith('http') ? url : `https://${url}`
  const startedAt = Date.now()

  if (!forcePlaywright) {
    try {
      console.log('[css] Starting extraction for', fullUrl)
      if (simulateCssFailure && IS_DEVELOPMENT) throw new Error('Simulated CSS extraction failure')

      const tokens = await Promise.race([
        extractViaCSS(fullUrl),
        timeoutAfter(4500, 'CSS extraction timeout')
      ])

      if (tokens && isUsableTheme(tokens)) {
        return res.json({ method: 'css', durationMs: Date.now() - startedAt, ...tokens })
      }
    } catch (error) {
      console.log('[css] Extraction failed:', error.message)
    }
  } else if (IS_DEVELOPMENT) {
    console.log('[test] CSS extraction intentionally skipped')
  }

  try {
    console.log('[playwright] Starting extraction for', fullUrl)
    const tokens = await Promise.race([
      extractViaBrowser(fullUrl),
      timeoutAfter(20000, 'Playwright extraction timeout')
    ])

    if (tokens && isUsableTheme(tokens)) {
      return res.json({ method: 'playwright', durationMs: Date.now() - startedAt, ...tokens })
    }
  } catch (error) {
    console.log('[playwright] Extraction failed:', error.message)
  }

  return res.json({ method: 'default', durationMs: Date.now() - startedAt, ...defaultTokens() })
})

async function extractViaCSS(url) {
  const baseUrl = new URL(url)
  const htmlRes = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
    signal: AbortSignal.timeout(8000)
  })

  if (!htmlRes.ok) throw new Error(`HTML request failed with ${htmlRes.status}`)

  const html = await htmlRes.text()
  const cssVars = {}
  collectCssVariables(html, cssVars)

  const cssUrls = new Set()
  for (const match of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)) {
    try { cssUrls.add(new URL(match[1], baseUrl).href) } catch {}
  }
  for (const match of html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["']/gi)) {
    try { cssUrls.add(new URL(match[1], baseUrl).href) } catch {}
  }

  const cssResults = await Promise.allSettled(
    [...cssUrls].slice(0, 5).map(async (cssUrl) => {
      const response = await fetch(cssUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error(`CSS request failed with ${response.status}`)
      return response.text()
    })
  )

  let cssText = cssResults
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .join('\n')

  for (const match of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) cssText += `\n${match[1]}`
  collectCssVariables(cssText, cssVars)

  const priorityVars = [
    '--primary', '--accent', '--brand', '--page-accent', '--primary-color',
    '--accent-color', '--brand-color', '--color-primary', '--color-accent'
  ]

  let brandColor = null
  for (const variable of priorityVars) {
    const resolved = resolveCssValue(cssVars[variable], cssVars)
    if (resolved && isRealColor(resolved)) {
      brandColor = resolved
      break
    }
  }

  if (!brandColor) {
    const colorCount = {}
    for (const match of cssText.matchAll(/#([0-9a-f]{6})\b/gi)) {
      const color = match[0].toLowerCase()
      if (isRealColor(color)) colorCount[color] = (colorCount[color] || 0) + 1
    }
    brandColor = Object.entries(colorCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  }

  if (!brandColor) return null

  const fontMatch = cssText.match(/font-family:\s*([^;}{]+)/i)
  const fontFamily = fontMatch ? resolveCssValue(fontMatch[1].trim(), cssVars) : null
  const radiusMatch = cssText.match(/border-radius:\s*(\d+(?:\.\d+)?(?:px|rem|em))/i)
  const borderRadius = radiusMatch ? radiusMatch[1] : null

  return {
    bgColor: null,
    textColor: null,
    fontFamily,
    fontSize: null,
    sectionBg: null,
    btnBg: brandColor,
    btnColor: getContrastingTextColor(brandColor),
    btnBorderRadius: borderRadius,
    btnFontWeight: null,
    btnPadding: null,
    inputBg: null,
    inputBorder: null,
    inputBorderRadius: null,
    inputPadding: null,
    inputColor: null,
    labelColor: null,
    labelFontWeight: null,
    labelFontSize: null,
    headingColor: null,
    headingFontWeight: null,
    confidence: { page: 0.2, button: 0.55, input: 0, label: 0, section: 0 },
    detected: { buttonText: null, buttonTag: null, inputTag: null }
  }
}

async function extractViaBrowser(url) {
  const { chromium } = require('playwright')
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 })
    await page.waitForTimeout(1000)
    return await page.evaluate(extractComputedTokens)
  } finally {
    await browser.close()
  }
}

function extractComputedTokens() {
  const parseColor = (value) => {
    if (!value) return null
    const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i)
    if (!match) return null
    return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) }
  }

  const isTransparent = (value) => {
    if (!value || value === 'transparent') return true
    const color = parseColor(value)
    return color ? color.a <= 0.05 : false
  }

  const luminance = (value) => {
    const color = parseColor(value)
    if (!color) return null
    const channels = [color.r, color.g, color.b].map((channel) => {
      const normalized = channel / 255
      return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }

  const contrastRatio = (foreground, background) => {
    const fg = luminance(foreground)
    const bg = luminance(background)
    if (fg === null || bg === null) return 0
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
  }

  const isVisible = (element, minWidth = 1, minHeight = 1) => {
    if (!element) return false
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return rect.width >= minWidth && rect.height >= minHeight && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.1
  }

  const effectiveBackground = (element) => {
    let current = element
    while (current) {
      const background = getComputedStyle(current).backgroundColor
      if (!isTransparent(background)) return background
      current = current.parentElement
    }
    const htmlBackground = getComputedStyle(document.documentElement).backgroundColor
    return isTransparent(htmlBackground) ? 'rgb(255, 255, 255)' : htmlBackground
  }

  const buttonCandidates = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], a[class*="button"], a[class*="btn"], .btn, .button, .elementor-button'))

  const scoreButton = (element) => {
    if (!isVisible(element, 50, 24)) return -Infinity
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const text = (element.innerText || element.value || element.getAttribute('aria-label') || '').trim().toLowerCase()
    let score = 0
    const horizontalPadding = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0')
    const verticalPadding = parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0')

    if (element.tagName === 'BUTTON') score += 30
    if (element.matches('input[type="submit"]')) score += 45
    if (element.getAttribute('role') === 'button') score += 20
    if (!isTransparent(style.backgroundColor)) score += 30
    else score -= 25
    if (contrastRatio(style.color, style.backgroundColor) >= 3) score += 20
    if (rect.width >= 90) score += 10
    if (rect.width >= 140) score += 5
    if (rect.height >= 36) score += 10
    if (horizontalPadding >= 16) score += 10
    if (verticalPadding >= 8) score += 10
    if (rect.top >= 0 && rect.top < window.innerHeight) score += 10
    if (/get started|start free|sign up|try|submit|continue|create|book|contact|join|buy|subscribe/.test(text)) score += 35
    if (/menu|close|search|previous|next|cookie|language|theme/.test(text)) score -= 25
    if (element.closest('header, nav') && !/get started|sign up|start free|try/.test(text)) score -= 10
    return score
  }

  const rankedButtons = buttonCandidates
    .map((element) => ({ element, score: scoreButton(element) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const bestButton = rankedButtons[0]
  const primaryButton = bestButton && bestButton.score >= 35 ? bestButton.element : null
  const buttonStyle = primaryButton ? getComputedStyle(primaryButton) : null

  const inputCandidates = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'))
    .filter((element) => isVisible(element, 100, 24))
    .sort((a, b) => {
      const aRect = a.getBoundingClientRect()
      const bRect = b.getBoundingClientRect()
      return bRect.width * bRect.height - aRect.width * aRect.height
    })

  const primaryInput = inputCandidates[0] || null
  const inputStyle = primaryInput ? getComputedStyle(primaryInput) : null

  const scoreInput = (element) => {
    if (!element || !isVisible(element, 100, 24)) return 0

    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    let score = 0

    if (rect.width >= 160) score += 0.2
    if (rect.height >= 32) score += 0.15
    if (rect.top >= 0 && rect.top < window.innerHeight) score += 0.15
    if (!isTransparent(style.backgroundColor)) score += 0.2

    const hasBorder = parseFloat(style.borderWidth || '0') > 0 && style.borderStyle !== 'none'
    if (hasBorder) score += 0.15

    if (element.closest('form') || ['email', 'text', 'search', 'tel', 'url', 'password'].includes(element.type)) {
      score += 0.15
    }

    const pageBackground = effectiveBackground(document.body)
    const inputBackground = isTransparent(style.backgroundColor) ? pageBackground : style.backgroundColor
    if (contrastRatio(style.color, inputBackground) >= 3) score += 0.1

    return Math.min(1, score)
  }

  const inputConfidence = scoreInput(primaryInput)
  const usableInput = inputConfidence >= 0.45

  let labelElement = null
  if (usableInput && primaryInput) {
    if (primaryInput.id) {
      try {
        labelElement = document.querySelector(`label[for="${CSS.escape(primaryInput.id)}"]`)
      } catch {}
    }
    labelElement ||= primaryInput.closest('label')
    labelElement ||= primaryInput.closest('form, fieldset, div')?.querySelector('label') || null
  }
  const labelStyle = labelElement ? getComputedStyle(labelElement) : null

  const headingElement = Array.from(document.querySelectorAll('h1, h2'))
    .find((element) => isVisible(element, 20, 20)) || null
  const headingStyle = headingElement ? getComputedStyle(headingElement) : null
  const bodyStyle = getComputedStyle(document.body)

  const findMeaningfulSection = (element) => {
    let current = element?.parentElement || null

    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect()
      const isLargeEnough = rect.width >= window.innerWidth * 0.5 && rect.height >= 120
      const isSemanticSection = current.matches(
        'section, main, article, header, [class*="section"], [class*="hero"], [class*="banner"]'
      )

      if (isLargeEnough && isSemanticSection) return current
      current = current.parentElement
    }

    return null
  }

  const sectionElement =
    findMeaningfulSection(primaryButton) ||
    findMeaningfulSection(headingElement) ||
    document.querySelector('main, section, header') ||
    document.body

  const buttonConfidence = bestButton
    ? Math.max(0, Math.min(1, bestButton.score / 100))
    : 0

  return {
    bgColor: effectiveBackground(document.body),
    textColor: bodyStyle.color,
    fontFamily: bodyStyle.fontFamily,
    fontSize: bodyStyle.fontSize,
    sectionBg: sectionElement ? effectiveBackground(sectionElement) : null,
    btnBg: buttonStyle?.backgroundColor ?? null,
    btnColor: buttonStyle?.color ?? null,
    btnBorderRadius: buttonStyle?.borderRadius ?? null,
    btnFontWeight: buttonStyle?.fontWeight ?? null,
    btnPadding: buttonStyle?.padding ?? null,
    inputBg: usableInput ? inputStyle.backgroundColor : null,
    inputBorder: usableInput ? inputStyle.border : null,
    inputBorderRadius: usableInput ? inputStyle.borderRadius : null,
    inputPadding: usableInput ? inputStyle.padding : null,
    inputColor: usableInput ? inputStyle.color : null,
    labelColor: labelStyle?.color ?? null,
    labelFontWeight: labelStyle?.fontWeight ?? null,
    labelFontSize: labelStyle?.fontSize ?? null,
    headingColor: headingStyle?.color ?? null,
    headingFontWeight: headingStyle?.fontWeight ?? null,
    confidence: { page: 1, button: buttonConfidence, input: inputConfidence, label: labelElement ? Math.min(0.9, inputConfidence + 0.1) : 0, section: sectionElement ? 0.7 : 0 },
    detected: { buttonText: primaryButton?.innerText?.trim() || primaryButton?.value || null, buttonTag: primaryButton?.tagName || null, inputTag: usableInput ? primaryInput?.tagName || null : null }
  }
}

function collectCssVariables(source, target) {
  for (const match of source.matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;}{]+)/gi)) target[match[1]] = match[2].trim()
}

function resolveCssValue(value, variables, seen = new Set()) {
  if (!value || typeof value !== 'string') return value
  return value.replace(/var\(\s*(--[a-z0-9_-]+)\s*(?:,\s*([^)]*))?\)/gi, (_match, name, fallback) => {
    if (seen.has(name)) return fallback?.trim() || name
    const resolved = variables[name]
    return resolved ? resolveCssValue(resolved, variables, new Set(seen).add(name)) : (fallback?.trim() || name)
  }).trim()
}

function timeoutAfter(ms, message) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
}

function isUsableTheme(tokens) {
  if (!tokens) return false
  const hasPageTheme = Boolean(tokens.bgColor && tokens.textColor && tokens.fontFamily)
  const hasCredibleButton = Boolean(tokens.btnBg && !isTransparentServerSide(tokens.btnBg) && (tokens.confidence?.button ?? 0.5) >= 0.35)
  return hasPageTheme || hasCredibleButton
}

function isTransparentServerSide(value) {
  if (!value || value === 'transparent') return true
  const match = value.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*([\d.]+))?\s*\)/i)
  return Boolean(match && match[1] !== undefined && Number(match[1]) <= 0.05)
}

function isRealColor(color) {
  if (!color || !color.startsWith('#')) return false
  const hex = color.replace('#', '')
  if (hex.length !== 6) return false
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const average = (r + g + b) / 3
  const difference = Math.max(Math.abs(r - average), Math.abs(g - average), Math.abs(b - average))
  return difference > 20 && average > 20 && average < 235
}

function getContrastingTextColor(hexColor) {
  if (!/^#[0-9a-f]{6}$/i.test(hexColor || '')) return '#ffffff'
  const hex = hexColor.slice(1)
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#000000' : '#ffffff'
}

function defaultTokens() {
  return {
    bgColor: 'rgb(255, 255, 255)', textColor: 'rgb(0, 0, 0)', fontFamily: 'Inter, sans-serif', fontSize: '16px',
    sectionBg: 'rgb(255, 255, 255)', btnBg: '#6366f1', btnColor: '#ffffff', btnBorderRadius: '8px', btnFontWeight: '600', btnPadding: '12px 24px',
    inputBg: null, inputBorder: null, inputBorderRadius: null, inputPadding: null, inputColor: null,
    labelColor: null, labelFontWeight: null, labelFontSize: null, headingColor: 'rgb(0, 0, 0)', headingFontWeight: '700',
    confidence: { page: 0.5, button: 0.5, input: 0, label: 0, section: 0.5 },
    detected: { buttonText: null, buttonTag: null, inputTag: null }
  }
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.listen(PORT, () => console.log(`Scraper running on port ${PORT}`))
