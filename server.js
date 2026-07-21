const express = require('express')
const { chromium } = require('playwright')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

app.post('/extract-styles', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL required' })
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await new Promise(r => setTimeout(r, 2000))
    const tokens = await page.evaluate(() => {
      const get = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null }
      const body = get('body')
      const btn = get('.elementor-button, a.elementor-button, .btn, button, a[class*="button"]')
      const input = get('input[type="text"], input[type="email"], input')
      const label = get('label')
      const heading = get('h1, h2')
      const bgCandidates = ['.elementor-top-section','.elementor-section','[class*="hero"]','[class*="banner"]','header','section','.section']
      let sectionBg = 'rgba(0,0,0,0)'
      for (const sel of bgCandidates) {
        const el = document.querySelector(sel)
        if (el) {
          const bg = getComputedStyle(el).backgroundColor
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') { sectionBg = bg; break }
        }
      }
      return {
        bgColor: body?.backgroundColor, textColor: body?.color,
        fontFamily: body?.fontFamily, fontSize: body?.fontSize,
        sectionBg,
        btnBg: btn?.backgroundColor, btnColor: btn?.color,
        btnBorderRadius: btn?.borderRadius, btnFontWeight: btn?.fontWeight, btnPadding: btn?.padding,
        inputBg: input?.backgroundColor, inputBorder: input?.border,
        inputBorderRadius: input?.borderRadius, inputPadding: input?.padding, inputColor: input?.color,
        labelColor: label?.color, labelFontWeight: label?.fontWeight, labelFontSize: label?.fontSize,
        headingColor: heading?.color, headingFontWeight: heading?.fontWeight,
      }
    })
    res.json(tokens)
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    if (browser) await browser.close()
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok' }))
app.listen(process.env.PORT || 3000, () => console.log('Scraper running on port 3000'))
