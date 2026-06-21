/* tslint:disable */
/* eslint-disable */

/**
 * 给 base SFNT 追加 COLR(按 doc.version 选 v0/v1)+ CPAL,返回新 SFNT 字节。
 */
export function add_colr(base_sfnt: Uint8Array, doc_json: string): Uint8Array;

/**
 * 向后兼容别名(等价 add_colr,doc 不带 version 即按 v1 处理)。
 */
export function add_colrv1(base_sfnt: Uint8Array, doc_json: string): Uint8Array;
