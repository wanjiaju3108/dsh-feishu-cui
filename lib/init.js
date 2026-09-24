/** 插件启动时的初始化：把当前会话缓存填上。（当前工作区的缓存还没做。） */

import { setCurrentSession } from './cache/current-session.js';

/**
 * 读配置里的当前会话，问宿主还在不在，把结论写进 `cache/current-session.js`。
 *
 * 之后上层读 `readSettings()` 拿到的就是这份缓存，不再问宿主。
 *
 * @param deps.logger 日志
 * @param deps.catalog 会话目录（`infra/host/session.js`）
 * @param deps.readConfiguredSessionId 读配置里配的当前会话
 * @returns 写进缓存的会话 ID；没配、或配的那个不在列表里时为空串
 */
export async function initCurrentSession({ logger, catalog, readConfiguredSessionId }) {
  const sessionId = readConfiguredSessionId();
  if (!sessionId) {
    setCurrentSession('');
    return '';
  }

  const alive = await catalog.hasSession(sessionId);
  if (!alive) logger.warn(`配置的当前会话 ${sessionId} 不在会话列表里，按「没有当前会话」处理`);
  setCurrentSession(alive ? sessionId : '');
  return alive ? sessionId : '';
}
