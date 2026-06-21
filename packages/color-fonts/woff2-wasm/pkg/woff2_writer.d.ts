/* tslint:disable */
/* eslint-disable */

/**
 * TTF(glyf)→ woff2,quality 0..=11(>11 夹到 11)。返回 woff2 字节。
 */
export function ttf_to_woff2(data: Uint8Array, quality: number): Uint8Array;
