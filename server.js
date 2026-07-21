const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3000
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production'

app.use(cors())
app.use(express.json())
const CSS_NAMED_COLORS = {
  aliceblue:'#f0f8ff',antiquewhite:'#faebd7',aqua:'#00ffff',aquamarine:'#7fffd4',
  azure:'#f0ffff',beige:'#f5f5dc',bisque:'#ffe4c4',black:'#000000',
  blanchedalmond:'#ffebcd',blue:'#0000ff',blueviolet:'#8a2be2',brown:'#a52a2a',
  burlywood:'#deb887',cadetblue:'#5f9ea0',chartreuse:'#7fff00',chocolate:'#d2691e',
  coral:'#ff7f50',cornflowerblue:'#6495ed',cornsilk:'#fff8dc',crimson:'#dc143c',
  cyan:'#00ffff',darkblue:'#00008b',darkcyan:'#008b8b',darkgoldenrod:'#b8860b',
  darkgray:'#a9a9a9',darkgreen:'#006400',darkgrey:'#a9a9a9',darkkhaki:'#bdb76b',
  darkmagenta:'#8b008b',darkolivegreen:'#556b2f',darkorange:'#ff8c00',
  darkorchid:'#9932cc',darkred:'#8b0000',darksalmon:'#e9967a',darkseagreen:'#8fbc8f',
  darkslateblue:'#483d8b',darkslategray:'#2f4f4f',darkslategrey:'#2f4f4f',
  darkturquoise:'#00ced1',darkviolet:'#9400d3',deeppink:'#ff1493',deepskyblue:'#00bfff',
  dimgray:'#696969',dimgrey:'#696969',dodgerblue:'#1e90ff',firebrick:'#b22222',
  floralwhite:'#fffaf0',forestgreen:'#228b22',fuchsia:'#ff00ff',gainsboro:'#dcdcdc',
  ghostwhite:'#f8f8ff',gold:'#ffd700',goldenrod:'#daa520',gray:'#808080',
  green:'#008000',greenyellow:'#adff2f',grey:'#808080',honeydew:'#f0fff0',
  hotpink:'#ff69b4',indianred:'#cd5c5c',indigo:'#4b0082',ivory:'#fffff0',
  khaki:'#f0e68c',lavender:'#e6e6fa',lavenderblush:'#fff0f5',lawngreen:'#7cfc00',
  lemonchiffon:'#fffacd',lightblue:'#add8e6',lightcoral:'#f08080',lightcyan:'#e0ffff',
  lightgoldenrodyellow:'#fafad2',lightgray:'#d3d3d3',lightgreen:'#90ee90',
  lightgrey:'#d3d3d3',lightpink:'#ffb6c1',lightsalmon:'#ffa07a',lightseagreen:'#20b2aa',
  lightskyblue:'#87cefa',lightslategray:'#778899',lightslategrey:'#778899',
  lightsteelblue:'#b0c4de',lightyellow:'#ffffe0',lime:'#00ff00',limegreen:'#32cd32',
  linen:'#faf0e6',magenta:'#ff00ff',maroon:'#800000',mediumaquamarine:'#66cdaa',
  mediumblue:'#0000cd',mediumorchid:'#ba55d3',mediumpurple:'#9370db',
  mediumseagreen:'#3cb371',mediumslateblue:'#7b68ee',mediumspringgreen:'#00fa9a',
  mediumturquoise:'#48d1cc',mediumvioletred:'#c71585',midnightblue:'#191970',
  mintcream:'#f5fffa',mistyrose:'#ffe4e1',moccasin:'#ffe4b5',navajowhite:'#ffdead',
  navy:'#000080',oldlace:'#fdf5e6',olive:'#808000',olivedrab:'#6b8e23',
  orange:'#ffa500',orangered:'#ff4500',orchid:'#da70d6',palegoldenrod:'#eee8aa',
  palegreen:'#98fb98',paleturquoise:'#afeeee',palevioletred:'#db7093',
  papayawhip:'#ffefd5',peachpuff:'#ffdab9',peru:'#cd853f',pink:'#ffc0cb',
  plum:'#dda0dd',powderblue:'#b0e0e6',purple:'#800080',rebeccapurple:'#663399',
  red:'#ff0000',rosybrown:'#bc8f8f',royalblue:'#4169e1',saddlebrown:'#8b4513',
  salmon:'#fa8072',sandybrown:'#f4a460',seagreen:'#2e8b57',seashell:'#fff5ee',
  sienna:'#a0522d',silver:'#c0c0c0',skyblue:'#87ceeb',slateblue:'#6a5acd',
  slategray:'#708090',slategrey:'#708090',snow:'#fffafa',springgreen:'#00ff7f',
  steelblue:'#4682b4',tan:'#d2b48c',teal:'#008080',thistle:'#d8bfd8',
  tomato:'#ff6347',turquoise:'#40e0d0',violet:'#ee82ee',wheat:'#f5deb3',
  white:'#ffffff',whitesmoke:'#f5f5f5',yellow:'#ffff00',yellowgreen:'#9acd32'
}
app.use((req, _res, next) => {
  console.log(`[request] ${req.method} ${req.url}`)
  next()
})

app.post('/extract-styles', async (req, res) => {
  const { url, forceCss = false, simulatePlaywrightFailure = false } = req.body || {}

  if (!url) return res.status(400).json({ error: 'URL required' })

  const fullUrl = url.startsWith('http') ? url : `https://${url}`
  const startedAt = Date.now()

  if (!forceCss) {
    try {
      console.log('[playwright] Starting extraction for', fullUrl)

      if (simulatePlaywrightFailure && IS_DEVELOPMENT) {
        throw new Error('Simulated Playwright extraction failure')
      }

      const tokens = await Promise.race([
        extractViaBrowser(fullUrl),
        timeoutAfter(20000, 'Playwright extraction timeout')
      ])

      if (tokens && isUsablePlaywrightTheme(tokens)) {
        return res.json({
          ...tokens,
          durationMs: Date.now() - startedAt,
          method: 'playwright'
        })
      }

      console.log('[playwright] Result was not usable; trying CSS fallback')
    } catch (error) {
      console.log('[playwright] Extraction failed:', error.message)
    }
  } else if (IS_DEVELOPMENT) {
    console.log('[test] Playwright extraction intentionally skipped')
  }

  let cssFailureReason = null

  try {
    console.log('[css] Starting fallback extraction for', fullUrl)

    const tokens = await Promise.race([
      extractViaCSS(fullUrl),
      timeoutAfter(60000, 'CSS extraction timeout')
    ])

    if (tokens && isUsableCssTheme(tokens)) {
      return res.json({
        ...tokens,
        durationMs: Date.now() - startedAt,
        method: 'css'
      })
    }

    console.log('[css] Result was not usable; returning defaults')
  } catch (error) {
    cssFailureReason = error.code || (error.name === 'TimeoutError' || error.name === 'AbortError' ? 'css_timeout' : 'css_failed')
    console.log('[css] Extraction failed:', error.message)
  }

  return res.json({
    ...defaultTokens(),
    durationMs: Date.now() - startedAt,
    method: 'default',
    fallbackReason: cssFailureReason || 'css_unusable'
  })
})

async function extractViaCSS(url) {
  const baseUrl = new URL(url)
  const htmlStartedAt = Date.now()

  const htmlRes = await fetch(url, {
    headers: browserHeaders('html'),
    redirect: 'follow',
    signal: AbortSignal.timeout(30000)
  })

  console.log('[css] HTML response', {
    status: htmlRes.status,
    finalUrl: htmlRes.url,
    contentType: htmlRes.headers.get('content-type'),
    server: htmlRes.headers.get('server'),
    durationMs: Date.now() - htmlStartedAt
  })

  const html = await htmlRes.text()

  if (!htmlRes.ok) {
    console.log('[css] HTML error preview:', html.slice(0, 300).replace(/\s+/g, ' '))
    const error = new Error(`HTML request failed with ${htmlRes.status}`)
    error.code = `css_html_${htmlRes.status}`
    throw error
  }

  if (!html.trim()) {
    const error = new Error('HTML response was empty')
    error.code = 'css_html_empty'
    throw error
  }

  console.log(`[css] HTML length: ${html.length}`)

  const cssVars = {}
  collectCssVariables(html, cssVars)

  const cssUrls = new Set()

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    const relMatch = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)
    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)
    const relValues = relMatch?.[1]?.toLowerCase().split(/\s+/) || []

    if (!hrefMatch || !relValues.includes('stylesheet')) continue

    try {
      const assetUrl = new URL(hrefMatch[1], htmlRes.url || baseUrl)
      if (assetUrl.protocol === 'http:' && assetUrl.hostname === baseUrl.hostname) {
        assetUrl.protocol = 'https:'
      }
      cssUrls.add(assetUrl.href)
    } catch {}
  }

  const stylesheetUrls = [...cssUrls]
  console.log(`[css] Found ${stylesheetUrls.length} linked stylesheets`)

  const cssResults = await Promise.allSettled(
    stylesheetUrls.map(async (cssUrl) => {
      const startedAt = Date.now()
      const response = await fetch(cssUrl, {
        headers: {
          ...browserHeaders('css'),
          Referer: htmlRes.url || url
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${cssUrl}`)
      }

      const text = await response.text()
      console.log(`[css] Downloaded ${cssUrl} (${text.length} chars, ${Date.now() - startedAt}ms)`)
      return { url: cssUrl, text }
    })
  )

  const downloadedCount = cssResults.filter((result) => result.status === 'fulfilled').length
  const failedResults = cssResults.filter((result) => result.status === 'rejected')

  console.log(`[css] Downloaded ${downloadedCount}/${cssResults.length} stylesheets; ${failedResults.length} failed`)

  for (const result of failedResults.slice(0, 10)) {
    console.log('[css] Stylesheet failure:', result.reason?.message || String(result.reason))
  }

  let cssText = cssResults
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value.text)
    .join('\n')

  for (const match of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    cssText += `\n${match[1]}`
  }

  console.log(`[css] Combined CSS length: ${cssText.length}`)

  if (!cssText.trim()) {
    const error = new Error('No CSS could be downloaded or extracted')
    error.code = 'css_no_stylesheets'
    throw error
  }

  collectCssVariables(cssText, cssVars)

  const stylesheetRecords = cssResults
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)

  const buttonResult = extractButtonStyleFromCss(stylesheetRecords, cssVars)
  const palette = extractMultiSignalPalette({
    html,
    stylesheets: stylesheetRecords,
    cssText,
    cssVars,
    buttonResult
  })

  console.log('[css] Selected button rule:', buttonResult
    ? {
        selector: buttonResult.selector,
        source: buttonResult.source,
        score: buttonResult.score,
        background: buttonResult.btnBg,
        color: buttonResult.btnColor
      }
    : null)
  console.log('[css] Palette signals:', palette.signals)
  console.log('[css] Final palette:', {
    primary: palette.primary,
    background: palette.background,
    text: palette.text,
    heading: palette.heading,
    logo: palette.logo,
    link: palette.link,
    hero: palette.heroBackground,
    heroGradient: palette.heroGradient
  })

  if (!palette.primary) {
    const error = new Error('No usable brand colour found from CSS, logo, variables, or page styles')
    error.code = 'css_no_brand_color'
    throw error
  }

  const fallbackFontFamily = extractPreferredFontFamily(stylesheetRecords, cssVars)

  return {
    bgColor: palette.background,
    pageBg: palette.background,
    formBg: palette.formBackground || palette.heroFallbackColor || palette.sectionBackground,
    heroBackground: palette.heroBackground,
    heroGradient: palette.heroGradient,
    textColor: palette.text,
    fontFamily: chooseUsableFontFamily(buttonResult?.fontFamily, fallbackFontFamily),
    fontSize: palette.fontSize,
    sectionBg: palette.sectionBackground,
    btnBg: buttonResult?.btnBg || palette.primary,
    btnColor: buttonResult?.btnColor || getContrastingTextColor(buttonResult?.btnBg || palette.primary),
    btnBorderRadius: buttonResult?.btnBorderRadius || null,
    btnFontWeight: buttonResult?.btnFontWeight || null,
    btnPadding: buttonResult?.btnPadding || null,
    inputBg: palette.inputBackground,
    inputBorder: palette.inputBorder,
    inputBorderRadius: palette.inputBorderRadius,
    inputPadding: null,
    inputColor: palette.inputText,
    labelColor: palette.label,
    labelFontWeight: null,
    labelFontSize: null,
    headingColor: palette.heading,
    headingFontWeight: null,
    confidence: {
      page: palette.background && palette.text ? 0.72 : 0.4,
      button: buttonResult ? Math.min(0.97, 0.7 + buttonResult.score / 900) : 0.58,
      input: palette.inputBackground || palette.inputBorder ? 0.45 : 0,
      label: palette.label ? 0.4 : 0,
      section: palette.sectionBackground ? 0.55 : 0.2,
      gradient: palette.heroGradient?.colors?.length >= 2 ? 0.9 : 0,
      brand: palette.confidence
    },
    detected: {
      buttonText: null,
      buttonTag: buttonResult ? 'CSS_SELECTOR' : null,
      buttonSelector: buttonResult?.selector || null,
      buttonSource: buttonResult?.source || null,
      brandSource: palette.primarySource,
      logoColor: palette.logo,
      linkColor: palette.link,
      heroSelector: palette.heroSelector || null,
      heroSource: palette.heroSource || null,
      formSelector: palette.formSelector || null,
      inputTag: null
    }
  }
}

function extractMultiSignalPalette({ html, stylesheets, cssText, cssVars, buttonResult }) {
  const votes = new Map()
  const signals = []

  const addVote = (color, weight, source, detail = null) => {
    const normalized = normalizeCssColor(color)
    if (!normalized || !isBrandCandidate(normalized)) return
    const existing = votes.get(normalized) || { score: 0, sources: [] }
    existing.score += weight
    existing.sources.push({ source, weight, detail })
    votes.set(normalized, existing)
    signals.push({ color: normalized, weight, source, detail })
  }

  // Explicit theme variables are strong signals, especially page-builder globals.
  const variableWeights = [
    [/--e-global-color-primary$/i, 150, 'elementor-primary-variable'],
    [/--e-global-color-accent$/i, 145, 'elementor-accent-variable'],
    [/--(?:brand|primary|accent)(?:-color)?$/i, 120, 'brand-variable'],
    [/--color-(?:brand|primary|accent)$/i, 115, 'brand-variable'],
    [/--e-global-color-secondary$/i, 70, 'elementor-secondary-variable']
  ]

  for (const [name, rawValue] of Object.entries(cssVars)) {
    for (const [pattern, weight, source] of variableWeights) {
      if (!pattern.test(name)) continue
      const value = extractResolvedColor(rawValue, cssVars)
      addVote(value, weight, source, name)
      break
    }
  }

  // The actual page-specific CTA is one signal, not the only signal.
  if (buttonResult?.btnBg) {
    const pageSpecific = isPageSpecificSource(buttonResult.source) || isPageSpecificSelector(buttonResult.selector)
    addVote(buttonResult.btnBg, pageSpecific ? 145 : 70, 'button', buttonResult.selector)
  }

  const semantic = extractSemanticCssStyles(stylesheets, cssVars)
  const inlineGradients = extractInlineGradients(html, cssVars)
  if (inlineGradients.length) {
    inlineGradients.sort((a, b) => b.score - a.score || b.order - a.order)
    const bestInline = inlineGradients[0]
    const current = semantic.page.heroGradient
    if (!current || bestInline.score > 250) {
      semantic.page.heroGradient = bestInline.gradient
      semantic.page.heroBackground = bestInline.gradient.raw
      semantic.page.heroSelector = bestInline.selector
      semantic.page.heroSource = bestInline.source
    }
  }
  for (const item of semantic.logoCandidates) addVote(item.color, item.weight, 'logo-css', item.selector)
  for (const item of semantic.linkCandidates) addVote(item.color, item.weight, 'link-css', item.selector)
  for (const item of semantic.accentCandidates) addVote(item.color, item.weight, 'page-accent', item.selector)

  const inlineLogoColors = extractInlineLogoColors(html)
  for (const color of inlineLogoColors) addVote(color, 105, 'inline-logo-svg')

  // Dominant colours are weak evidence and page-specific styles count more than frameworks.
  const frequency = new Map()
  for (const stylesheet of stylesheets) {
    const sourceWeight = isPageSpecificSource(stylesheet.url) ? 3 : isFrameworkSource(stylesheet.url) ? 0.25 : 1
    for (const raw of extractCssColors(stylesheet.text)) {
      const color = normalizeCssColor(raw)
      if (!color || !isBrandCandidate(color)) continue
      frequency.set(color, (frequency.get(color) || 0) + sourceWeight)
    }
  }
  for (const [color, count] of [...frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    addVote(color, Math.min(35, 6 + Math.log2(count + 1) * 4), 'weighted-frequency', Math.round(count * 100) / 100)
  }

  const ranked = [...votes.entries()]
    .map(([color, value]) => ({ color, ...value }))
    .sort((a, b) => b.score - a.score)

  const primary = ranked[0]?.color || buttonResult?.btnBg || null
  const primarySource = ranked[0]?.sources?.[0]?.source || (buttonResult ? 'button' : null)

  const page = semantic.page
  const background = page.background || '#ffffff'
  const text = page.text || getContrastingTextColor(background)

  return {
    primary,
    primarySource,
    confidence: ranked[0] ? Math.min(0.96, 0.48 + ranked[0].score / 500) : 0.3,
    background,
    text,
    heading: page.heading || text,
    sectionBackground: page.sectionBackground || background,
    formBackground: page.formBackground || null,
    formSelector: page.formSelector || null,
    heroBackground: page.heroBackground || page.sectionBackground || background,
    heroGradient: page.heroGradient || null,
    heroFallbackColor: page.heroGradient?.colors?.[0] || page.sectionBackground || background,
    heroSelector: page.heroSelector || null,
    heroSource: page.heroSource || null,
    logo: inlineLogoColors[0] || semantic.logoCandidates[0]?.color || null,
    link: semantic.linkCandidates[0]?.color || primary,
    fontSize: page.fontSize || null,
    label: page.label || text,
    inputBackground: page.inputBackground || null,
    inputBorder: page.inputBorder || null,
    inputBorderRadius: page.inputBorderRadius || null,
    inputText: page.inputText || text,
    signals: ranked.slice(0, 8).map((item) => ({
      color: item.color,
      score: Math.round(item.score),
      sources: item.sources.slice(0, 3)
    }))
  }
}

function extractSemanticCssStyles(stylesheets, cssVars) {
  const logoCandidates = []
  const linkCandidates = []
  const accentCandidates = []
  const pageCandidates = {
    background: [], text: [], heading: [], sectionBackground: [], formBackground: [], fontSize: [],
    label: [], inputBackground: [], inputBorder: [], inputBorderRadius: [], inputText: [],
    gradients: []
  }
  let order = 0

  const push = (bucket, value, score, selector, source) => {
    if (!value) return
    bucket.push({ value, score, selector, source, order: order++ })
  }

  for (const stylesheet of stylesheets) {
    const css = stripCssComments(stylesheet.text)
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g
    let match
    while ((match = rulePattern.exec(css))) {
      const selectorGroup = match[1].trim()
      if (!selectorGroup || selectorGroup.startsWith('@')) continue
      const declarations = parseCssDeclarations(match[2])
      if (!declarations) continue

      for (const rawSelector of selectorGroup.split(',')) {
        const selector = rawSelector.trim()
        const lower = selector.toLowerCase()
        const specificity = cssSpecificityScore(selector)
        const sourceBonus = isPageSpecificSource(stylesheet.url) ? 65 : isFrameworkSource(stylesheet.url) ? -35 : 0
        const score = specificity + sourceBonus
        const bg = extractResolvedColor(declarations['background-color'] || declarations.background, cssVars)
        const color = extractResolvedColor(declarations.color, cssVars)
        const fill = extractResolvedColor(declarations.fill, cssVars)
        const stroke = extractResolvedColor(declarations.stroke, cssVars)
        const gradient = extractGradient(declarations['background-image'] || declarations.background, cssVars)

        if (gradient && isPlausibleHeroGradientSelector(selector, stylesheet.url)) {
          let gradientScore = score
          if (/hero|banner|masthead|above-the-fold|jumbotron|hero-section/.test(lower)) gradientScore += 240
          if (/section|elementor-section|elementor-element/.test(lower)) gradientScore += 70
          if (isPageSpecificSource(stylesheet.url)) gradientScore += 180
          if (isPageSpecificSelector(selector)) gradientScore += 120
          if (/timeline|card|widget|tooltip|modal|dropdown|carousel|progress|alert/.test(lower)) gradientScore -= 220
          if (isFrameworkSource(stylesheet.url)) gradientScore -= 260
          if (gradient.colors.length >= 2 && gradient.colors.every(isNearWhite)) gradientScore -= 130
          pageCandidates.gradients.push({
            value: gradient.raw,
            gradient,
            score: gradientScore,
            selector,
            source: stylesheet.url,
            order: order++
          })
        }

        if (isTrustedLogoSelector(selector, stylesheet.url)) {
          for (const candidate of [fill, stroke, color, bg]) {
            if (candidate && isBrandCandidate(candidate)) {
              logoCandidates.push({ color: candidate, weight: 85 + Math.max(0, score / 4), selector, source: stylesheet.url })
            }
          }
        }
        if (/(^|[\s>+~])a(?=$|[\s.:#\[>+~])|\.elementor-widget-text-editor\s+a|\.entry-content\s+a/.test(lower) && !/:hover|:focus|:active|:visited/.test(lower)) {
          if (color && isBrandCandidate(color)) linkCandidates.push({ color, weight: 55 + Math.max(0, score / 6), selector, source: stylesheet.url })
        }
        if (/accent|primary|highlight|cta/.test(lower) && bg && isBrandCandidate(bg)) {
          accentCandidates.push({ color: bg, weight: 60 + Math.max(0, score / 5), selector, source: stylesheet.url })
        }

        if (/^(?:html|body|:root)(?:\b|[\s.,:#])/.test(lower) || lower === 'body') {
          push(pageCandidates.background, bg, score + 90, selector, stylesheet.url)
          push(pageCandidates.text, color, score + 80, selector, stylesheet.url)
          push(pageCandidates.fontSize, cleanCssValue(declarations['font-size'], cssVars), score + 30, selector, stylesheet.url)
        }
        if (isTrustedHeadingSelector(selector, stylesheet.url)) {
          push(pageCandidates.heading, color, score + (isPageSpecificSource(stylesheet.url) ? 150 : 40), selector, stylesheet.url)
        }
        if (/section|\.elementor-section|\.elementor-container|\.site-main|main\b/.test(lower) && bg) {
          push(pageCandidates.sectionBackground, bg, score + 35, selector, stylesheet.url)
        }
        if (isFormContainerSelector(selector, stylesheet.url) && bg) {
          push(pageCandidates.formBackground, bg, score + (isPageSpecificSource(stylesheet.url) ? 170 : 55), selector, stylesheet.url)
        }
        if (/label\b|\.elementor-field-label/.test(lower)) push(pageCandidates.label, color, score + 35, selector, stylesheet.url)
        if (/input\b|textarea\b|select\b|\.elementor-field\b/.test(lower)) {
          push(pageCandidates.inputBackground, bg, score + 30, selector, stylesheet.url)
          push(pageCandidates.inputText, color, score + 25, selector, stylesheet.url)
          push(pageCandidates.inputBorder, cleanCssValue(declarations.border, cssVars), score + 20, selector, stylesheet.url)
          push(pageCandidates.inputBorderRadius, cleanCssValue(declarations['border-radius'], cssVars), score + 20, selector, stylesheet.url)
        }
      }
    }
  }

  const bestItem = (items) => items
    .filter((x) => x.value && x.score > 0)
    .sort((a, b) => b.score - a.score || b.order - a.order)[0] || null
  const best = (items) => bestItem(items)?.value || null

  logoCandidates.sort((a, b) => b.weight - a.weight)
  linkCandidates.sort((a, b) => b.weight - a.weight)
  accentCandidates.sort((a, b) => b.weight - a.weight)
  pageCandidates.gradients.sort((a, b) => b.score - a.score || b.order - a.order)
  const bestGradient = pageCandidates.gradients.find((x) => x.score > 0) || null
  const bestForm = bestItem(pageCandidates.formBackground)

  return {
    logoCandidates,
    linkCandidates,
    accentCandidates,
    page: {
      background: best(pageCandidates.background),
      text: best(pageCandidates.text),
      heading: best(pageCandidates.heading),
      sectionBackground: best(pageCandidates.sectionBackground),
      formBackground: bestForm?.value || null,
      formSelector: bestForm?.selector || null,
      heroBackground: bestGradient?.gradient?.raw || best(pageCandidates.sectionBackground),
      heroGradient: bestGradient?.gradient || null,
      heroSelector: bestGradient?.selector || null,
      heroSource: bestGradient?.source || null,
      fontSize: best(pageCandidates.fontSize),
      label: best(pageCandidates.label),
      inputBackground: best(pageCandidates.inputBackground),
      inputBorder: best(pageCandidates.inputBorder),
      inputBorderRadius: best(pageCandidates.inputBorderRadius),
      inputText: best(pageCandidates.inputText)
    }
  }
}


function isIconFont(fontFamily = '') {
  return /font awesome|dashicons|elementor-icons|eicons|icomoon|material icons|socicon|themify|simple-line-icons/i.test(fontFamily)
}

function chooseUsableFontFamily(primary, fallback) {
  for (const value of [primary, fallback]) {
    if (value && !isIconFont(value)) return value
  }
  return 'Inter, sans-serif'
}

function extractPreferredFontFamily(stylesheets, cssVars) {
  const candidates = []
  let order = 0
  for (const stylesheet of stylesheets) {
    const css = stripCssComments(stylesheet.text)
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g
    let match
    while ((match = rulePattern.exec(css))) {
      const selector = match[1].trim()
      if (!selector || selector.startsWith('@')) continue
      const declarations = parseCssDeclarations(match[2])
      const family = cleanCssValue(declarations?.['font-family'], cssVars)
      if (!family || isIconFont(family)) continue
      const lower = selector.toLowerCase()
      let score = 0
      if (lower === 'body' || /^(?:html\s+)?body\b/.test(lower)) score += 220
      if (/:root|html\b/.test(lower)) score += 100
      if (/elementor-kit-\d+/.test(lower)) score += 180
      if (/p\b|\.elementor-widget-text-editor/.test(lower)) score += 45
      if (isPageSpecificSource(stylesheet.url)) score += 80
      if (isFrameworkSource(stylesheet.url)) score -= 50
      candidates.push({ family, score, order: order++ })
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.order - a.order)
  return candidates.find((x) => x.score > 0)?.family || null
}

function isNearWhite(color) {
  const rgb = hexToRgb(normalizeCssColor(color))
  return Boolean(rgb && rgb.r >= 238 && rgb.g >= 238 && rgb.b >= 238)
}

function isPlausibleHeroGradientSelector(selector, source) {
  const lower = selector.toLowerCase()
  if (/timeline|card|widget|tooltip|modal|dropdown|progress|alert|button|input|textarea|select|:before|:after/.test(lower)) return false
  const semantic = /hero|banner|masthead|above-the-fold|jumbotron|header|\.elementor-section|\.e-con(?:\b|[-_])|\.elementor-element/.test(lower)
  return semantic && (isPageSpecificSource(source) || isPageSpecificSelector(selector) || /hero|banner|masthead|above-the-fold|jumbotron/.test(lower))
}

function isFormContainerSelector(selector, source) {
  const lower = selector.toLowerCase()
  if (/:before|:after|:checked|:hover|:focus|input|textarea|select|label|cookies-consent|comment-form/.test(lower)) return false
  const directForm = /(^|[\s>+~])(form|\.raven-form|\.elementor-form|\.wpcf7|\.gform_wrapper|\.form-wrapper|\.contact-form|\.signup-form|\.lead-form)(?=$|[\s.:#\[>+~])/.test(lower)
  return directForm && (!isFrameworkSource(source) || isPageSpecificSelector(selector))
}

function isTrustedHeadingSelector(selector, source) {
  const lower = selector.toLowerCase()
  if (/highlight|mark|warning|alert|screen-reader|accessibility|tooltip|code|pre|:hover|:focus/.test(lower)) return false
  const heading = /(^|[\s>+~])(h1|h2|h3|h4|h5|h6)(?=$|[\s.:#\[>+~])|\.elementor-heading-title|\.entry-title|\.page-title/.test(lower)
  return heading && (isPageSpecificSource(source) || !isFrameworkSource(source))
}

function isTrustedLogoSelector(selector, source) {
  const lower = selector.toLowerCase()
  if (!/(\.custom-logo|\.site-logo|\.elementor-widget-theme-site-logo|\.site-branding|\.navbar-brand)(?:\b|[-_\s.:#>])/.test(lower)) return false
  if (/icon|social|footer-credit|badge/.test(lower)) return false
  return isPageSpecificSource(source) || !isFrameworkSource(source)
}

function extractGradient(value, cssVars) {
  if (!value || typeof value !== 'string') return null
  const resolved = resolveCssValue(value, cssVars)
  const match = resolved.match(/((?:linear|radial|conic)-gradient\((?:[^()]|\([^()]*\))*\))/i)
  if (!match) return null

  const raw = match[1].trim()
  const colors = []
  for (const token of extractCssColors(raw)) {
    const normalized = normalizeCssColor(token)
    if (normalized && !colors.includes(normalized)) colors.push(normalized)
  }

  // Resolve variables that remain inside the gradient.
  for (const variable of raw.matchAll(/var\(\s*(--[\w-]+)(?:\s*,\s*([^\)]+))?\)/gi)) {
    const candidate = cssVars[variable[1]] || variable[2]
    const color = extractResolvedColor(candidate, cssVars)
    if (color && !colors.includes(color)) colors.push(color)
  }

  if (colors.length < 2) return null

  return {
    type: raw.toLowerCase().startsWith('radial-gradient')
      ? 'radial'
      : raw.toLowerCase().startsWith('conic-gradient')
        ? 'conic'
        : 'linear',
    raw,
    colors: colors.slice(0, 8)
  }
}

function extractInlineGradients(html, cssVars) {
  const candidates = []
  let order = 0
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*?)style=["']([^"']*(?:gradient\()[^"']*)["']([^>]*)>/gi)) {
    const tag = match[1]
    const attrs = `${match[2]} ${match[4]}`
    const style = match[3]
    const declarations = parseCssDeclarations(style)
    const gradient = extractGradient(declarations?.['background-image'] || declarations?.background, cssVars)
    if (!gradient) continue
    const identity = `${tag} ${attrs}`.toLowerCase()
    let score = 90
    if (/hero|banner|masthead|above-the-fold/.test(identity)) score += 180
    if (/form|signup|contact|lead/.test(identity)) score += 130
    if (/section|elementor/.test(identity)) score += 70
    candidates.push({ gradient, score, selector: `inline:${tag}`, source: 'inline-style', order: order++ })
  }
  return candidates
}

function extractInlineLogoColors(html) {
  const colors = []
  for (const svgMatch of html.matchAll(/<(?:svg)\b[^>]*(?:class|id)=["'][^"']*(?:logo|brand)[^"']*["'][^>]*>[\s\S]*?<\/svg>/gi)) {
    for (const attr of svgMatch[0].matchAll(/(?:fill|stroke)=["']([^"']+)["']/gi)) {
      const color = normalizeCssColor(attr[1])
      if (color && isBrandCandidate(color) && !colors.includes(color)) colors.push(color)
    }
  }
  return colors.slice(0, 8)
}

function isPageSpecificSource(source = '') {
  return /\/uploads\/elementor\/css\/post-\d+\.css|\/uploads\/jupiterx\/compiler\//i.test(source)
}

function isFrameworkSource(source = '') {
  return /\/plugins\/.*(?:frontend|bootstrap|font-awesome|animate).*\.css/i.test(source)
}

function isPageSpecificSelector(selector = '') {
  return /\.elementor-\d+|\.elementor-element-[a-z0-9]+/i.test(selector)
}

function cssSpecificityScore(selector = '') {
  return (selector.match(/#[\w-]+/g) || []).length * 100 +
    (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(?:\([^)]*\))?/g) || []).length * 10 +
    (selector.match(/(^|[\s>+~])(?:[a-z][\w-]*)(?=$|[\s.:#\[>+~])/gi) || []).length
}

function isBrandCandidate(color) {
  if (!color || !isRealColor(color)) return false
  const rgb = hexToRgb(color)
  if (!rgb) return false
  const max = Math.max(rgb.r, rgb.g, rgb.b)
  const min = Math.min(rgb.r, rgb.g, rgb.b)
  // Exclude near-greys, black, and white from primary brand voting.
  return max - min >= 22 && !(max > 242 && min > 242) && !(max < 28 && min < 28)
}

function hexToRgb(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(color || '')
  if (!match) return null
  return {
    r: parseInt(match[1].slice(0, 2), 16),
    g: parseInt(match[1].slice(2, 4), 16),
    b: parseInt(match[1].slice(4, 6), 16)
  }
}

function extractButtonStyleFromCss(stylesheets, cssVars) {
  const candidates = []
  let order = 0

  for (const stylesheet of stylesheets) {
    const css = stripCssComments(stylesheet.text)
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g
    let match

    while ((match = rulePattern.exec(css))) {
      const selectorGroup = match[1].trim()
      const body = match[2]

      if (!selectorGroup || selectorGroup.startsWith('@')) continue

      const declarations = parseCssDeclarations(body)
      if (!declarations) continue

      for (const selector of selectorGroup.split(',')) {
        const cleanSelector = selector.trim()
        const selectorScore = scoreButtonSelector(cleanSelector)
        if (selectorScore <= 0) continue

        const backgroundValue =
          declarations['background-color'] || declarations.background || null
        const foregroundValue = declarations.color || null
        const btnBg = extractResolvedColor(backgroundValue, cssVars)
        const btnColor = extractResolvedColor(foregroundValue, cssVars)

        // A candidate without a declared button background is too speculative.
        if (!btnBg || !isRealColor(btnBg)) continue

        let score = selectorScore + 35
        if (btnColor && isRealColor(btnColor)) score += 18
        if (declarations.padding) score += 12
        if (declarations['border-radius']) score += 10
        if (declarations['font-weight']) score += 6
        if (declarations['font-family']) score += 4
        if (!/:hover|:focus|:active/i.test(cleanSelector)) score += 8
        if (/disabled|aria-disabled/i.test(cleanSelector)) score -= 60

        // Model the CSS cascade: generated page styles override plugin defaults.
        if (isPageSpecificSource(stylesheet.url)) score += 120
        if (isPageSpecificSelector(cleanSelector)) score += 100
        if (cleanSelector.includes(':not(')) score += 12
        if (isFrameworkSource(stylesheet.url)) score -= 80
        if (/button-(?:success|info|warning|danger|primary|secondary)/i.test(cleanSelector)) score -= 100
        if (/^\s*\.raven-form \.raven-submit-button\s*$/i.test(cleanSelector)) score -= 45

        candidates.push({
          selector: cleanSelector,
          source: stylesheet.url,
          order: order++,
          score,
          btnBg,
          btnColor,
          btnBorderRadius: cleanCssValue(declarations['border-radius'], cssVars),
          btnFontWeight: cleanCssValue(declarations['font-weight'], cssVars),
          btnPadding: cleanCssValue(declarations.padding, cssVars),
          fontFamily: cleanCssValue(declarations['font-family'], cssVars)
        })
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.order - a.order)

  console.log('[css] Top button candidates:', candidates.slice(0, 5).map((item) => ({
    selector: item.selector,
    score: item.score,
    background: item.btnBg,
    source: item.source
  })))

  return candidates[0] || null
}

function scoreButtonSelector(selector) {
  if (!selector || /@keyframes|from\b|to\b|\d+%/.test(selector)) return 0

  let score = 0
  const lower = selector.toLowerCase()

  if (/\.elementor-button(?:\b|[-_])/.test(lower)) score += 150
  if (/\.wp-element-button\b|\.wp-block-button__link\b/.test(lower)) score += 140
  if (/input\s*\[\s*type\s*=\s*["']?(submit|button)/.test(lower)) score += 135
  if (/(^|[\s>+~])button(?=$|[\s.:#\[>+~])/.test(lower)) score += 125
  if (/\[role\s*=\s*["']?button/.test(lower)) score += 115
  if (/\.jet-(?:button|submit)\b|\.raven-(?:button|submit)\b/.test(lower)) score += 110
  if (/\.(?:btn|button)(?:\b|[-_])/.test(lower)) score += 90
  if (/submit|cta|call-to-action/.test(lower)) score += 55

  if (score === 0) return 0

  score += (selector.match(/#[\w-]+/g) || []).length * 18
  score += (selector.match(/\.[\w-]+/g) || []).length * 5
  score += (selector.match(/\[[^\]]+\]/g) || []).length * 7
  score += Math.min(20, (selector.match(/[>+~\s]+/g) || []).length * 2)

  // Generic framework selectors should not beat page-specific button rules.
  if (/^\s*\.btn(?:\s*|:[\w-]+)\s*$/.test(lower)) score -= 35
  if (/^\s*button(?:\s*|:[\w-]+)\s*$/.test(lower)) score -= 25

  return score
}

function parseCssDeclarations(body) {
  const declarations = {}

  for (const chunk of body.split(';')) {
    const colon = chunk.indexOf(':')
    if (colon <= 0) continue

    const property = chunk.slice(0, colon).trim().toLowerCase()
    const value = chunk.slice(colon + 1).replace(/!important\s*$/i, '').trim()
    if (property && value) declarations[property] = value
  }

  return Object.keys(declarations).length ? declarations : null
}

function extractResolvedColor(value, cssVars) {
  if (!value) return null
  const resolved = resolveCssValue(value, cssVars)
  const direct = normalizeCssColor(resolved)
  if (direct) return direct

  const match = extractCssColors(resolved)[0]
  return match ? normalizeCssColor(match) : null
}

function cleanCssValue(value, cssVars) {
  if (!value) return null
  return resolveCssValue(value, cssVars).trim() || null
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function browserHeaders(resourceType = 'html') {
  const common = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/126.0.0.0 Safari/537.36',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache'
  }

  if (resourceType === 'css') {
    return {
      ...common,
      Accept: 'text/css,*/*;q=0.1'
    }
  }

  return {
    ...common,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,' +
      'image/avif,image/webp,*/*;q=0.8',
    'Upgrade-Insecure-Requests': '1'
  }
}

function extractCssColors(cssText) {
  return [
    ...cssText.matchAll(
      /#[0-9a-f]{3,8}\b|rgba?\(\s*\d{1,3}\s*[, ]\s*\d{1,3}\s*[, ]\s*\d{1,3}(?:\s*[,/]\s*[\d.]+%?)?\s*\)/gi
    )
  ].map((match) => match[0])
}

function normalizeCssColor(value) {
  if (!value || typeof value !== 'string') return null
  const color = value.trim().toLowerCase()

  if (/^#[0-9a-f]{3}$/.test(color))
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`

  if (/^#[0-9a-f]{6}$/.test(color)) return color

  const rgb = color.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/)
  if (rgb) {
    return `#${rgb.slice(1, 4)
      .map((ch) => Math.max(0, Math.min(255, Number(ch))).toString(16).padStart(2, '0'))
      .join('')}`
  }

  const hsl = color.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/)
  if (hsl) {
    const h = Number(hsl[1]) / 360
    const s = Number(hsl[2]) / 100
    const l = Number(hsl[3]) / 100
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const hue2rgb = (t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const r = Math.round(hue2rgb(h + 1/3) * 255)
    const g = Math.round(hue2rgb(h) * 255)
    const b = Math.round(hue2rgb(h - 1/3) * 255)
    return `#${[r, g, b].map((ch) => ch.toString(16).padStart(2, '0')).join('')}`
  }

  return CSS_NAMED_COLORS[color] || null
}

async function extractViaBrowser(url) {
  const { chromium } = require('playwright')

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage']
  })

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 }
    })

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 12000
    })

    await page.waitForTimeout(1000)

    return await page.evaluate(extractComputedTokens)
  } finally {
    await browser.close()
  }
}

function extractComputedTokens() {
  const parseColor = (value) => {
    if (!value) return null

    const match = value.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i
    )

    if (!match) return null

    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] === undefined ? 1 : Number(match[4])
    }
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
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4)
    })

    return (
      0.2126 * channels[0] +
      0.7152 * channels[1] +
      0.0722 * channels[2]
    )
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

    return (
      rect.width >= minWidth &&
      rect.height >= minHeight &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0.1
    )
  }

  const effectiveBackground = (element) => {
    let current = element

    while (current) {
      const background = getComputedStyle(current).backgroundColor
      if (!isTransparent(background)) return background
      current = current.parentElement
    }

    const htmlBackground =
      getComputedStyle(document.documentElement).backgroundColor

    return isTransparent(htmlBackground)
      ? 'rgb(255, 255, 255)'
      : htmlBackground
  }
  
  const getKitBackground = () => {
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (!rule.selectorText) continue
          const sel = rule.selectorText
          // Must be the kit root selector, not a nested one
          if (!/^\.elementor-kit-\d+$/.test(sel.trim())) continue
          const bg = rule.style?.backgroundColor
          if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg
        }
      } catch {}
    }
  } catch {}
  return null
}

  const buttonCandidates = Array.from(
    document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a[role="button"], a[class*="button"], a[class*="btn"], .btn, .button, .elementor-button'
    )
  )

  const scoreButton = (element) => {
    if (!isVisible(element, 50, 24)) return -Infinity

    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const text = (
      element.innerText ||
      element.value ||
      element.getAttribute('aria-label') ||
      ''
    )
      .trim()
      .toLowerCase()

    let score = 0

    const horizontalPadding =
      parseFloat(style.paddingLeft || '0') +
      parseFloat(style.paddingRight || '0')

    const verticalPadding =
      parseFloat(style.paddingTop || '0') +
      parseFloat(style.paddingBottom || '0')

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

    if (
      /get started|start free|sign up|try|submit|continue|create|book|contact|join|buy|subscribe/.test(
        text
      )
    ) {
      score += 35
    }

    if (
      /menu|close|search|previous|next|cookie|language|theme/.test(text)
    ) {
      score -= 25
    }

    if (
      element.closest('header, nav') &&
      !/get started|sign up|start free|try/.test(text)
    ) {
      score -= 10
    }

    return score
  }

  const rankedButtons = buttonCandidates
    .map((element) => ({ element, score: scoreButton(element) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)

  const bestButton = rankedButtons[0]
  const primaryButton =
    bestButton && bestButton.score >= 35 ? bestButton.element : null
  const buttonStyle = primaryButton
    ? getComputedStyle(primaryButton)
    : null

  const inputCandidates = Array.from(
    document.querySelectorAll(
      'input:not([type="hidden"]), textarea, select'
    )
  )
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

    const hasBorder =
      parseFloat(style.borderWidth || '0') > 0 &&
      style.borderStyle !== 'none'

    if (hasBorder) score += 0.15

    if (
      element.closest('form') ||
      ['email', 'text', 'search', 'tel', 'url', 'password'].includes(
        element.type
      )
    ) {
      score += 0.15
    }

    const pageBackground = effectiveBackground(document.body)
    const inputBackground = isTransparent(style.backgroundColor)
      ? pageBackground
      : style.backgroundColor

    if (contrastRatio(style.color, inputBackground) >= 3) score += 0.1

    return Math.min(1, score)
  }

  const inputConfidence = scoreInput(primaryInput)
  const usableInput = inputConfidence >= 0.45

  let labelElement = null

  if (usableInput && primaryInput) {
    if (primaryInput.id) {
      try {
        labelElement = document.querySelector(
          `label[for="${CSS.escape(primaryInput.id)}"]`
        )
      } catch {}
    }

    labelElement ||= primaryInput.closest('label')
    labelElement ||=
      primaryInput
        .closest('form, fieldset, div')
        ?.querySelector('label') || null
  }

  const labelStyle = labelElement ? getComputedStyle(labelElement) : null

  const headingElement =
    Array.from(document.querySelectorAll('h1, h2')).find((element) =>
      isVisible(element, 20, 20)
    ) || null

  const headingStyle = headingElement
    ? getComputedStyle(headingElement)
    : null

  const bodyStyle = getComputedStyle(document.body)

  const findMeaningfulSection = (element) => {
    let current = element?.parentElement || null

    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect()

      const isLargeEnough =
        rect.width >= window.innerWidth * 0.5 && rect.height >= 120

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
    bgColor: (() => {
      const bodyBg = effectiveBackground(document.body)
      const isDefault = bodyBg === 'rgb(255, 255, 255)' || bodyBg === 'rgba(0, 0, 0, 0)'
      if (!isDefault) return bodyBg

      const sections = Array.from(document.querySelectorAll(
        '.elementor-top-section, section.elementor-section, .e-con, section, main'
      ))

      for (const el of sections) {
        const rect = el.getBoundingClientRect()
        if (rect.width < window.innerWidth * 0.8 || rect.height < 200) continue

        const bg = getComputedStyle(el).backgroundColor
        if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue

        const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/)
        if (!match) continue
        const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])]
        const isNearWhite = r > 240 && g > 240 && b > 240
        const isNearBlack = r < 15 && g < 15 && b < 15
        if (isNearWhite || isNearBlack) continue

        return bg
      }

      return bodyBg
    })(),
    textColor: bodyStyle.color,
    fontFamily: bodyStyle.fontFamily,
    fontSize: bodyStyle.fontSize,
    sectionBg: (() => {
      const sections = Array.from(document.querySelectorAll(
        '.elementor-top-section, section.elementor-section, .e-con, section, main'
      ))
      for (const el of sections) {
        const bg = getComputedStyle(el).backgroundColor
        if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue
        const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/)
        if (!match) continue
        const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])]
        if (r > 240 && g > 240 && b > 240) continue
        if (r < 15 && g < 15 && b < 15) continue
        return bg
      }
      return sectionElement ? effectiveBackground(sectionElement) : null
    })(),
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
    confidence: {
      page: 1,
      button: buttonConfidence,
      input: inputConfidence,
      label: labelElement
        ? Math.min(0.9, inputConfidence + 0.1)
        : 0,
      section: sectionElement ? 0.7 : 0
    },
    detected: {
      buttonText:
        primaryButton?.innerText?.trim() ||
        primaryButton?.value ||
        null,
      buttonTag: primaryButton?.tagName || null,
      inputTag: usableInput
        ? primaryInput?.tagName || null
        : null
    }
  }
}

function collectCssVariables(source, target) {
  for (const match of source.matchAll(
    /(--[a-z0-9_-]+)\s*:\s*([^;}{]+)/gi
  )) {
    target[match[1]] = match[2].trim()
  }
}

function resolveCssValue(value, variables, seen = new Set()) {
  if (!value || typeof value !== 'string') return value

  return value
    .replace(
      /var\(\s*(--[a-z0-9_-]+)\s*(?:,\s*([^)]*))?\)/gi,
      (_match, name, fallback) => {
        if (seen.has(name)) return fallback?.trim() || name

        const resolved = variables[name]

        return resolved
          ? resolveCssValue(
              resolved,
              variables,
              new Set(seen).add(name)
            )
          : fallback?.trim() || name
      }
    )
    .trim()
}

function timeoutAfter(ms, message) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms)
  )
}

function isUsablePlaywrightTheme(tokens) {
  if (!tokens) return false

  const hasPageTheme = Boolean(
    tokens.bgColor &&
      tokens.textColor &&
      tokens.fontFamily &&
      (tokens.confidence?.page ?? 0) >= 0.5
  )

  const hasDetectedButton = Boolean(
    tokens.btnBg &&
      !isTransparentServerSide(tokens.btnBg) &&
      tokens.detected?.buttonTag &&
      (tokens.confidence?.button ?? 0) >= 0.45
  )

  return hasPageTheme || hasDetectedButton
}

function isUsableCssTheme(tokens) {
  if (!tokens) return false

  const hasStrongPageTheme = Boolean(
    tokens.bgColor &&
      tokens.textColor &&
      tokens.fontFamily &&
      (tokens.confidence?.page ?? 0) >= 0.6
  )

  const hasVerifiedButton = Boolean(
    tokens.btnBg &&
      tokens.btnColor &&
      !isTransparentServerSide(tokens.btnBg) &&
      (tokens.confidence?.button ?? 0) >= 0.6
  )

  return hasStrongPageTheme || hasVerifiedButton
}

function isTransparentServerSide(value) {
  if (!value || value === 'transparent') return true

  const match = value.match(
    /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*([\d.]+))?\s*\)/i
  )

  return Boolean(
    match &&
      match[1] !== undefined &&
      Number(match[1]) <= 0.05
  )
}

function isRealColor(color) {
  if (!color || !color.startsWith('#')) return false

  const hex = color.replace('#', '')
  if (hex.length !== 6) return false

  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const average = (r + g + b) / 3

  const difference = Math.max(
    Math.abs(r - average),
    Math.abs(g - average),
    Math.abs(b - average)
  )

  return difference > 20 && average > 20 && average < 235
}

function getContrastingTextColor(hexColor) {
  if (!/^#[0-9a-f]{6}$/i.test(hexColor || '')) {
    return '#ffffff'
  }

  const hex = hexColor.slice(1)
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)

  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
    ? '#000000'
    : '#ffffff'
}

function defaultTokens() {
  return {
    bgColor: 'rgb(255, 255, 255)',
    pageBg: 'rgb(255, 255, 255)',
    formBg: 'rgb(255, 255, 255)',
    heroBackground: 'rgb(255, 255, 255)',
    heroGradient: null,
    textColor: 'rgb(0, 0, 0)',
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    sectionBg: 'rgb(255, 255, 255)',
    btnBg: '#6366f1',
    btnColor: '#ffffff',
    btnBorderRadius: '8px',
    btnFontWeight: '600',
    btnPadding: '12px 24px',
    inputBg: null,
    inputBorder: null,
    inputBorderRadius: null,
    inputPadding: null,
    inputColor: null,
    labelColor: null,
    labelFontWeight: null,
    labelFontSize: null,
    headingColor: 'rgb(0, 0, 0)',
    headingFontWeight: '700',
    confidence: {
      page: 0.5,
      button: 0.5,
      input: 0,
      label: 0,
      section: 0.5
    },
    detected: {
      buttonText: null,
      buttonTag: null,
      inputTag: null
    }
  }
}
// ... rest of your code ...
app.post('/debug-scrape', async (req, res) => {
  const { url } = req.body || {}
  const fullUrl = url.startsWith('http') ? url : `https://${url}`
  const { chromium } = require('playwright')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    })
    const page = await context.newPage()
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(2000)

    const debug = await page.evaluate(() => {
      const bodyInline = document.body.getAttribute('style')
      const dynamicStyles = Array.from(document.querySelectorAll('style'))
        .map(s => s.textContent)
        .filter(t => t.includes('elementor-kit') || t.includes('background'))
        .map(t => t.slice(0, 500))
      const kitEl = document.querySelector('.elementor-kit-3')
      const kitComputed = kitEl ? getComputedStyle(kitEl).backgroundColor : null
      const purpleEls = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const bg = getComputedStyle(el).backgroundColor
          return bg && bg.includes('rgb(') && !bg.includes('255, 255, 255') && !bg.includes('0, 0, 0')
        })
        .slice(0, 5)
        .map(el => ({
          tag: el.tagName,
          class: el.className.slice(0, 80),
          bg: getComputedStyle(el).backgroundColor
        }))
      return { bodyInline, dynamicStyles, kitComputed, purpleEls }
    })

    res.json(debug)
  } finally {
    await browser.close()
  }
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`Scraper running on port ${PORT}`)
})
