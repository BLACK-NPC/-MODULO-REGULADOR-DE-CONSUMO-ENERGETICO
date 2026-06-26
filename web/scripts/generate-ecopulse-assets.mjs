import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const src = process.argv[2]
const webPublic = process.argv[3]
const hmiOut = process.argv[4]

if (!src || !webPublic || !hmiOut) {
  console.error('Usage: node generate-ecopulse-assets.mjs <src.png> <web/public> <hmi/DESARROLLO>')
  process.exit(1)
}

async function resizePng(size, dest) {
  await sharp(src).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(dest)
}

async function generateLvglC(size, dest) {
  const { data, info } = await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const bytes = []
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3] ?? 255
    bytes.push(b, g, r, a)
  }

  const lines = []
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16)
    lines.push(`    ${chunk.map((b) => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`).join(',')},`)
  }

  const content = `// EcoPulse boot logo - generated from assets/ecopulse.png
#include "ui.h"

#ifndef LV_ATTRIBUTE_MEM_ALIGN
    #define LV_ATTRIBUTE_MEM_ALIGN
#endif

const LV_ATTRIBUTE_MEM_ALIGN uint8_t ui_img_ecopulse_png_data[] = {
${lines.join('\n')}
};
const lv_img_dsc_t ui_img_ecopulse_png = {
    .header.always_zero = 0,
    .header.w = ${info.width},
    .header.h = ${info.height},
    .data_size = sizeof(ui_img_ecopulse_png_data),
    .header.cf = LV_IMG_CF_TRUE_COLOR_ALPHA,
    .data = ui_img_ecopulse_png_data
};
`
  fs.writeFileSync(dest, content, 'utf8')
}

await resizePng(32, path.join(webPublic, 'icon-light-32x32.png'))
await resizePng(32, path.join(webPublic, 'icon-dark-32x32.png'))
await resizePng(192, path.join(webPublic, 'icono-192.png'))
await resizePng(512, path.join(webPublic, 'icono-512.png'))
await resizePng(512, path.join(webPublic, 'apple-icon.png'))
await resizePng(512, path.join(webPublic, 'ecopulse-logo.png'))
await generateLvglC(200, path.join(hmiOut, 'ui_img_ecopulse_png.c'))
console.log('EcoPulse assets generated')
