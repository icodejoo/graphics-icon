// 为无随包类型(无 @types)的第三方字体/几何库给最小 ambient 声明,
// 使 tsup `dts:true` 能干净产出 .d.ts(运行时行为不变,仅供类型检查/声明产出)。
// Minimal ambient module declarations for untyped third-party deps so `tsup --dts` emits cleanly.

declare module 'opentype.js' {
  // 引擎只用到 opentype.parse(...) 做只读解析,以及一个宽松的 Path 类型别名。
  export type Path = any
  const opentype: {
    parse(buffer: ArrayBuffer | Uint8Array): any
    [key: string]: any
  }
  export default opentype
}

declare module 'cubic2quad' {
  const cubic2quad: (...args: any[]) => any
  export default cubic2quad
}

declare module 'ttf2woff' {
  const ttf2woff: (input: any, options?: any) => any
  export default ttf2woff
}

declare module 'svg2ttf' {
  const svg2ttf: (svgFontString: string, options?: any) => any
  export default svg2ttf
}
