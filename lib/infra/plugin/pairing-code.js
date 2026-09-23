/** 配对码的生成，以及把用户手输的内容规范化。 */

import { randomInt } from 'node:crypto';

/** 配对码字母表：去掉了容易看错的 I/O/0/1。 */
export const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 配对码长度。 */
export const PAIRING_CODE_LENGTH = 8;

/**
 * 生成一个配对码。
 *
 * @returns `PAIRING_CODE_LENGTH` 位的随机码，字符取自 `PAIRING_ALPHABET`
 */
export function createPairingCode() {
  let code = '';
  for (let index = 0; index < PAIRING_CODE_LENGTH; index += 1) {
    code += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  }
  return code;
}

/**
 * 规范化用户手输的配对码：去掉空白和连字符、统一大写。
 *
 * @param text 原始输入
 * @returns 规范化后的文本
 */
export function normalizePairingText(text) {
  return String(text ?? '').replace(/[\s-]/g, '').toUpperCase();
}
