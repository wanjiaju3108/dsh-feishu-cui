/** 配置读写：当前会话、user、当前工作区三项，走宿主 `settings` 服务的命名空间。 */

import z from '@deepseek-ai/schemastery';

import { getSettingsScope, setSettingsScope } from '../../cache/settings-scope.js';

/** 设置命名空间；跟 `credentials.js` 的 ref 一样写这里。 */
export const SETTINGS_NAMESPACE = 'feishu-cui';

/** 普通配置的 schema；三个字段都带默认值，所以缺席也能加载。 */
const SettingsSchema = z.object({
  sessionId: z.string().default(''),
  userId: z.string().default(''),
  workspaceId: z.string().default(''),
});

/**
 * 注册命名空间，把返回的 owner scope 存进 `cache/settings-scope.js`。
 *
 * @param deps.settings 宿主设置服务（`ctx.get('settings')`）
 * @param deps.logger 日志
 */
export function registerSettings({ settings, logger }) {
  if (!settings) {
    logger.warn('宿主没有设置服务，当前会话、user 与工作区只存在内存里');
    return;
  }
  try {
    setSettingsScope(settings.register(SETTINGS_NAMESPACE, SettingsSchema, { applies: 'live' }));
  } catch (error) {
    logger.warn(`设置注册失败：${error?.message ?? error}`);
  }
}

/**
 * 读三项设置。
 *
 * @returns `{ sessionId, userId, workspaceId }`；没注册上时三项都是空串
 */
export function readSettings() {
  const stored = getSettingsScope()?.get() ?? {};
  return {
    sessionId: stored.sessionId ?? '',
    userId: stored.userId ?? '',
    workspaceId: stored.workspaceId ?? '',
  };
}

/**
 * 写设置（整体替换那一节）。
 *
 * @param next `{ sessionId, userId, workspaceId }`
 */
export async function writeSettings(next) {
  const scope = getSettingsScope();
  if (!scope) return;
  const merged = { ...(scope.get() ?? {}), ...next };
  await scope.replace(merged);
}
