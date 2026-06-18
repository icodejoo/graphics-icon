import { optimize } from 'svgo'

/**
 * 字体场景的 SVG 规范化:基本图形 → path、去 arc/相对坐标。
 * 关键:保留 viewBox、不 mergePaths(后续按颜色拆层需要原始分组)。
 */
export function normalizeSvg(svg: string): string {
  const res = optimize(svg, {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            // svgo v4 默认已保留 viewBox(removeViewBox 不在 preset-default)。
            mergePaths: false,
            convertShapeToPath: { convertArcs: true },
          },
        },
      },
    ],
  })
  return res.data
}
