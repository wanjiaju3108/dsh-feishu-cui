/** 最近处理过的飞书消息 ID：同一条消息只处理第一次。 */

/** 记多少条。 */
export const HANDLED_MESSAGE_LIMIT = 200;

/** 按处理顺序记的消息 ID 集合。 */
const seen = new Set();

/**
 * 这条消息是不是已经处理过了。
 *
 * @param messageId 飞书消息 ID
 * @returns 处理过时 true
 */
export function hasHandled(messageId) {
  return typeof messageId === 'string' && messageId !== '' && seen.has(messageId);
}

/**
 * 记下这条消息已经处理过。
 *
 * @param messageId 飞书消息 ID
 */
export function rememberHandled(messageId) {
  if (typeof messageId !== 'string' || messageId === '') return;
  seen.delete(messageId);
  seen.add(messageId);
  while (seen.size > HANDLED_MESSAGE_LIMIT) seen.delete(seen.values().next().value);
}
