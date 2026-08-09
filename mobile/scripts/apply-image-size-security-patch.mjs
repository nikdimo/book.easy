import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const imageSizeEntry = require.resolve('image-size')
const imageSizeRoot = path.dirname(path.dirname(imageSizeEntry))
const packageJson = JSON.parse(
  await readFile(path.join(imageSizeRoot, 'package.json'), 'utf8'),
)

if (packageJson.version !== '1.2.1') {
  throw new Error(
    `Review the image-size security patch for version ${packageJson.version} before installing it.`,
  )
}

async function patchFile(relativePath, insecureText, secureText) {
  const filePath = path.join(imageSizeRoot, relativePath)
  const source = await readFile(filePath, 'utf8')

  if (source.includes(secureText)) return
  if (!source.includes(insecureText)) {
    throw new Error(`Could not apply the expected image-size patch to ${relativePath}.`)
  }

  await writeFile(filePath, source.replace(insecureText, secureText))
}

await patchFile(
  'dist/types/utils.js',
  `    const boxSize = (0, exports.readUInt32BE)(input, offset);\n    if (input.length - offset < boxSize)\n        return;`,
  `    const boxSize = (0, exports.readUInt32BE)(input, offset);\n    // ISO BMFF boxes need an 8-byte header. Reject zero/undersized boxes so\n    // malformed JXL and HEIF input cannot keep a parser loop at one offset.\n    if (boxSize < 8 || input.length - offset < boxSize)\n        return;`,
)

await patchFile(
  'dist/types/icns.js',
  `        let imageSize = getImageSize(imageHeader[0]);\n        imageOffset += imageHeader[1];`,
  `        let imageSize = getImageSize(imageHeader[0]);\n        if (imageHeader[1] < SIZE_HEADER || imageOffset + imageHeader[1] > fileLength || imageOffset + imageHeader[1] > inputLength)\n            throw new TypeError('Invalid ICNS entry length');\n        imageOffset += imageHeader[1];`,
)

await patchFile(
  'dist/types/icns.js',
  `            imageSize = getImageSize(imageHeader[0]);\n            imageOffset += imageHeader[1];`,
  `            imageSize = getImageSize(imageHeader[0]);\n            if (imageHeader[1] < SIZE_HEADER || imageOffset + imageHeader[1] > fileLength || imageOffset + imageHeader[1] > inputLength)\n                throw new TypeError('Invalid ICNS entry length');\n            imageOffset += imageHeader[1];`,
)

const { findBox } = require(path.join(imageSizeRoot, 'dist/types/utils.js'))
const { ICNS } = require(path.join(imageSizeRoot, 'dist/types/icns.js'))

const zeroLengthBox = Uint8Array.from([0, 0, 0, 0, 0x6a, 0x78, 0x6c, 0x70])
if (findBox(zeroLengthBox, 'missing', 0) !== undefined) {
  throw new Error('The image-size JXL/HEIF zero-length box patch is not active.')
}

const malformedIcns = Uint8Array.from([
  0x69, 0x63, 0x6e, 0x73, 0, 0, 0, 16,
  0x69, 0x63, 0x31, 0x30, 0, 0, 0, 0,
])
try {
  ICNS.calculate(malformedIcns)
  throw new Error('The image-size ICNS zero-length entry patch is not active.')
} catch (error) {
  if (!(error instanceof TypeError) || error.message !== 'Invalid ICNS entry length') {
    throw error
  }
}

console.log(`Applied and verified image-size ${packageJson.version} security patch.`)
