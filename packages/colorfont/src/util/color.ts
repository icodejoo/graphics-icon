export interface Rgba {
  /** '#rrggbb'(不含 alpha)。 */
  hex: string
  /** 0..1。 */
  alpha: number
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  transparent: '#000000',
}

function clampByte(v: string): string {
  let n: number
  if (v.endsWith('%')) n = Math.round((parseFloat(v) / 100) * 255)
  else n = Math.round(parseFloat(v))
  n = Math.max(0, Math.min(255, n || 0))
  return n.toString(16).padStart(2, '0')
}

/** 解析任意 CSS 颜色为 { hex(#rrggbb), alpha }。无法识别 → 黑色。 */
export function toRgba(input: string): Rgba {
  let c = input.trim().toLowerCase()
  if (c === 'transparent') return { hex: '#000000', alpha: 0 }
  if (NAMED[c]) c = NAMED[c]

  if (c.startsWith('#')) {
    let h = c.slice(1)
    if (h.length === 3) h = h.replace(/./g, (x) => x + x)
    else if (h.length === 4) h = h.replace(/./g, (x) => x + x)
    let alpha = 1
    if (h.length === 8) {
      alpha = parseInt(h.slice(6, 8), 16) / 255
      h = h.slice(0, 6)
    }
    if (h.length === 6 && /^[0-9a-f]{6}$/.test(h)) return { hex: '#' + h, alpha }
  }

  const rgb = c.match(/rgba?\(([^)]+)\)/)
  if (rgb) {
    const parts = rgb[1].split(/[, /]+/).filter(Boolean)
    const [r, g, b] = parts
    const alpha = parts[3] !== undefined ? parseFloat(parts[3]) : 1
    return { hex: '#' + clampByte(r) + clampByte(g) + clampByte(b), alpha }
  }

  return { hex: '#000000', alpha: 1 }
}
