// 把额外的二进制表(COLR / CPAL / 'SVG ')注入一个已有 SFNT(glyf)字体:
// 解析表目录 → 合并/替换表 → 按 tag 排序重排 → 重算偏移 + 校验和 + head.checkSumAdjustment。
// write-fonts(wasm)负责 COLRv1;COLRv0、OT-SVG 由本模块手工注入。

/** 计算一段 4 字节对齐缓冲区的表校验和(big-endian uint32 累加)。 */
function tableChecksum(buf: Uint8Array, offset: number, paddedLen: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let sum = 0
  for (let i = 0; i < paddedLen; i += 4) {
    sum = (sum + dv.getUint32(offset + i)) >>> 0
  }
  return sum >>> 0
}

function pad4(tag: string): string {
  return (tag + '    ').slice(0, 4)
}

/**
 * 注入(或按 tag 替换)若干表,返回新的 SFNT 字节。
 * @param font 原始字体(glyf SFNT)
 * @param add  要加入的表 [{ tag, data }];tag 不足 4 字符以空格补齐
 */
export function injectTables(font: Uint8Array, add: { tag: string; data: Uint8Array }[]): Uint8Array {
  const dv = new DataView(font.buffer, font.byteOffset, font.byteLength)
  const sfntVersion = dv.getUint32(0)
  const numTables = dv.getUint16(4)

  // 读出现有表
  const tables = new Map<string, Uint8Array>()
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    const tag = String.fromCharCode(
      dv.getUint8(rec),
      dv.getUint8(rec + 1),
      dv.getUint8(rec + 2),
      dv.getUint8(rec + 3),
    )
    const off = dv.getUint32(rec + 8)
    const len = dv.getUint32(rec + 12)
    tables.set(tag, font.subarray(off, off + len))
  }
  // 合并/替换
  for (const t of add) tables.set(pad4(t.tag), t.data)

  // 表目录按 tag 升序(OpenType 要求)
  const tags = [...tables.keys()].sort()
  const n = tags.length
  const headerSize = 12 + 16 * n

  // 布局:每表 4 字节对齐
  let cursor = headerSize
  const layout = tags.map((tag) => {
    const data = tables.get(tag)!
    const length = data.length
    const padded = (length + 3) & ~3
    const entry = { tag, data, offset: cursor, length, padded }
    cursor += padded
    return entry
  })
  const total = cursor

  const out = new Uint8Array(total)
  const odv = new DataView(out.buffer)

  // offset table
  const entrySelector = Math.max(0, Math.floor(Math.log2(n)))
  const searchRange = Math.pow(2, entrySelector) * 16
  odv.setUint32(0, sfntVersion)
  odv.setUint16(4, n)
  odv.setUint16(6, searchRange)
  odv.setUint16(8, entrySelector)
  odv.setUint16(10, n * 16 - searchRange)

  // 写数据 + 表记录
  let rec = 12
  for (const e of layout) {
    out.set(e.data, e.offset) // 余下 padding 已是 0
    const checksum = tableChecksum(out, e.offset, e.padded)
    odv.setUint8(rec, e.tag.charCodeAt(0))
    odv.setUint8(rec + 1, e.tag.charCodeAt(1))
    odv.setUint8(rec + 2, e.tag.charCodeAt(2))
    odv.setUint8(rec + 3, e.tag.charCodeAt(3))
    odv.setUint32(rec + 4, checksum)
    odv.setUint32(rec + 8, e.offset)
    odv.setUint32(rec + 12, e.length)
    rec += 16
  }

  // 修正 head.checkSumAdjustment = 0xB1B0AFBA - 全字体校验和
  const head = layout.find((e) => e.tag === 'head')
  if (head) {
    const adjOff = head.offset + 8
    odv.setUint32(adjOff, 0)
    const whole = tableChecksum(out, 0, total)
    odv.setUint32(adjOff, (0xb1b0afba - whole) >>> 0)
  }

  return out
}
