// Packs several PNGs into a single multi-resolution .ico container. Modern
// Windows (Vista+) accepts PNG-compressed frames directly inside an ICO, so no
// BMP re-encoding is needed — just a correct ICONDIR/ICONDIRENTRY header per frame.
import fs from 'node:fs'
import path from 'node:path'

const sizesDir = path.join(import.meta.dirname, 'sizes')
const sizes = [16, 32, 48, 256]
const pngs = sizes.map((size) => fs.readFileSync(path.join(sizesDir, `icon-${size}.png`)))

const headerSize = 6
const entrySize = 16
const dirEntriesSize = entrySize * pngs.length

const header = Buffer.alloc(headerSize)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: 1 = icon
header.writeUInt16LE(pngs.length, 4) // image count

let offset = headerSize + dirEntriesSize
const entries = []
for (let i = 0; i < pngs.length; i++) {
  const size = sizes[i]
  const png = pngs[i]
  const entry = Buffer.alloc(entrySize)
  entry.writeUInt8(size === 256 ? 0 : size, 0) // width (0 = 256)
  entry.writeUInt8(size === 256 ? 0 : size, 1) // height (0 = 256)
  entry.writeUInt8(0, 2) // color palette
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8) // image data size
  entry.writeUInt32LE(offset, 12) // offset of image data
  entries.push(entry)
  offset += png.length
}

const ico = Buffer.concat([header, ...entries, ...pngs])
const outPath = path.join(import.meta.dirname, '..', 'resources', 'icon.ico')
fs.writeFileSync(outPath, ico)
console.log(`Wrote ${outPath} (${ico.length} bytes, ${pngs.length} frames: ${sizes.join(', ')})`)
