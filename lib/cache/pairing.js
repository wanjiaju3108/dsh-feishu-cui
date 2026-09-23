/** 「申请配对」这一步的运行时状态：配对码。 */

/** 配对码有效期。 */
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

/** 当前有效的配对码；空串表示没有在册的码。 */
let pairingCode = '';

/** 配对码的过期时刻（毫秒时间戳）。 */
let pairingCodeExpiresAt = 0;

/**
 * 读当前有效的配对码。
 *
 * @returns 配对码；没有在册的码、或已过期时为空串
 */
export function readPairingCode() {
  if (!pairingCode) return '';
  if (Date.now() > pairingCodeExpiresAt) {
    clearPairingCode();
    return '';
  }
  return pairingCode;
}

/**
 * 写入一个新的配对码，覆盖上一个。
 *
 * @param code 配对码
 */
export function setPairingCode(code) {
  pairingCode = code ?? '';
  pairingCodeExpiresAt = pairingCode ? Date.now() + PAIRING_CODE_TTL_MS : 0;
}

/** 清掉配对码。 */
export function clearPairingCode() {
  pairingCode = '';
  pairingCodeExpiresAt = 0;
}
