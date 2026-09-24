/** 当前会话：插件认的那一条。启动时校验一次，之后跟着设置一起更新。 */

/** 当前会话 ID；空串表示没有。 */
let currentSessionId = '';

/**
 * 读当前会话。
 *
 * @returns 会话 ID；没有时为空串
 */
export function readCurrentSession() {
  return currentSessionId;
}

/**
 * 写当前会话。
 *
 * @param sessionId 会话 ID；空串表示没有
 */
export function setCurrentSession(sessionId) {
  currentSessionId = sessionId ?? '';
}
