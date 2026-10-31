// Renders public/logo.svg into all PNG icon sizes. Run: node design/make-icons.cjs
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const pub = path.join(__dirname, '..', 'public')
const svg = fs.readFileSync(path.join(pub, 'logo.svg'), 'utf8')
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage()
  const shoot = async (size, file, { bleed = false } = {}) => {
    await p.setViewportSize({ width: size, height: size })
    // bleed: full square in the logo's background colour with the artwork shrunk into the
    // safe zone (maskable / apple icons get cropped or rounded by the OS)
    const bg = (svg.match(/<rect[^>]*fill="(#[0-9a-fA-F]+)"/) || [])[1] || '#000'
    const inner = Math.round(size * (bleed ? 0.8 : 1))
    const art = svg.replace('<svg', `<svg width="${inner}" height="${inner}"`)
    await p.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bleed ? bg : 'transparent'}">${art}</body></html>`)
    await p.screenshot({ path: path.join(pub, file), omitBackground: !bleed })
  }
  await shoot(192, 'icon-192.png')
  await shoot(512, 'icon-512.png')
  await shoot(512, 'icon-maskable-512.png', { bleed: true })
  await shoot(180, 'apple-touch-icon.png', { bleed: true })
  await shoot(120, 'logo-120.png')
  await b.close()
})()
