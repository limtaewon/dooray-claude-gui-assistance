#!/usr/bin/env node
/**
 * build/icon.svg → icon.png (1024) + macOS icon.icns + Windows icon.ico
 * 필요: sharp, 그리고 macOS에서 iconutil 사용 가능해야 함
 */
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const buildDir = join(__dirname, '..', 'build')
const svgPath = join(buildDir, 'icon.svg')
const pngPath = join(buildDir, 'icon.png')
const icnsPath = join(buildDir, 'icon.icns')
const icoPath = join(buildDir, 'icon.ico')

if (!existsSync(svgPath)) {
  console.error('build/icon.svg not found')
  process.exit(1)
}

const svgBuf = readFileSync(svgPath)

async function svgToPng(size, out) {
  await sharp(svgBuf, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(out)
}

// 1) 메인 icon.png 1024
await svgToPng(1024, pngPath)
console.log('✓ icon.png (1024)')

// 2) macOS ICNS — iconset 폴더 만든 뒤 iconutil
const iconset = join(buildDir, 'icon.iconset')
if (existsSync(iconset)) rmSync(iconset, { recursive: true, force: true })
mkdirSync(iconset)

const sizes = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png']
]
for (const [size, name] of sizes) {
  await svgToPng(size, join(iconset, name))
}
try {
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icnsPath])
  console.log('✓ icon.icns')
} catch (err) {
  console.error('iconutil 실패:', err.message)
}
rmSync(iconset, { recursive: true, force: true })

// 3) Windows ICO — 여러 크기 PNG 버퍼를 ICO 포맷으로 직접 조립
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoImages = await Promise.all(icoSizes.map(async (s) => ({
  size: s,
  buf: await sharp(svgBuf, { density: 384 }).resize(s, s).png().toBuffer()
})))

function buildIco(images) {
  const n = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: ICO
  header.writeUInt16LE(n, 4)

  const dir = Buffer.alloc(16 * n)
  let offset = 6 + 16 * n
  const bufs = [header, dir]

  images.forEach((img, i) => {
    const entryOff = i * 16
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, entryOff)     // width
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, entryOff + 1) // height
    dir.writeUInt8(0, entryOff + 2)                              // palette
    dir.writeUInt8(0, entryOff + 3)                              // reserved
    dir.writeUInt16LE(1, entryOff + 4)                           // planes
    dir.writeUInt16LE(32, entryOff + 6)                          // bits
    dir.writeUInt32LE(img.buf.length, entryOff + 8)              // size
    dir.writeUInt32LE(offset, entryOff + 12)                     // offset
    bufs.push(img.buf)
    offset += img.buf.length
  })

  return Buffer.concat(bufs)
}

writeFileSync(icoPath, buildIco(icoImages))
console.log('✓ icon.ico')
console.log('\n모든 아이콘 생성 완료')
