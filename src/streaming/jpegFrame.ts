import { MAX_STREAM_HEIGHT, MAX_STREAM_JPEG_BYTES, MAX_STREAM_WIDTH } from './streamTypes'

/** JPEG metadata를 먼저 확인해 큰 이미지가 decoder 메모리를 할당하지 못하게 한다. */
export function streamJpegBytes(base64: string): Uint8Array<ArrayBuffer> | null {
  if (base64.length === 0 || base64.length > Math.ceil(MAX_STREAM_JPEG_BYTES / 3) * 4 ||
    base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null
  let binary: string
  try { binary = atob(base64) } catch { return null }
  if (binary.length > MAX_STREAM_JPEG_BYTES || binary.length < 4) return null
  const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0))
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null
  let position = 2
  let hasDimensions = false
  while (position + 3 < bytes.length) {
    if (bytes[position++] !== 0xff) return null
    while (bytes[position] === 0xff) position += 1
    const marker = bytes[position++]
    if (marker === 0xd9) return null
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const length = bytes[position] * 256 + bytes[position + 1]
    if (length < 2 || position + length > bytes.length) return null
    if (marker === 0xda) return hasDimensions ? bytes : null
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (hasDimensions || length < 8 || bytes[position + 2] !== 8) return null
      const height = bytes[position + 3] * 256 + bytes[position + 4]
      const width = bytes[position + 5] * 256 + bytes[position + 6]
      if (width < 2 || height < 2 || width > MAX_STREAM_WIDTH || height > MAX_STREAM_HEIGHT) return null
      hasDimensions = true
    } else if ([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf, 0xdc].includes(marker)) {
      return null
    }
    position += length
  }
  return null
}

export async function decodeStreamJpeg(jpeg: string): Promise<ImageBitmap> {
  const bytes = streamJpegBytes(jpeg)
  if (bytes === null) throw new Error('Invalid stream JPEG')
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))
  if (bitmap.width < 2 || bitmap.height < 2 || bitmap.width > MAX_STREAM_WIDTH || bitmap.height > MAX_STREAM_HEIGHT) {
    bitmap.close()
    throw new Error('Stream JPEG dimensions exceeded')
  }
  return bitmap
}
