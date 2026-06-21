/* tslint:disable */
/* eslint-disable */

/**
 * 给 base SFNT 追加 COLRv1 + CPAL,返回新的 SFNT 字节。
 */
export function add_colrv1(base_sfnt: Uint8Array, doc_json: string): Uint8Array;
