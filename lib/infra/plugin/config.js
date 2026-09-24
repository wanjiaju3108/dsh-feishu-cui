/** 配置读写：当前会话、user、当前工作区、防休眠开关，走插件条目的 config。 */

import z from '@deepseek-ai/schemastery';

import { readCurrentSession, setCurrentSession } from '../../cache/current-session.js';
import { getSettingsHandle, setSettingsHandle } from '../../cache/settings-handle.js';
import { readConfigField } from '../common/config-field.js';

/** 设置命名空间，同时也是 loader 条目 id；设置服务按条目 id 定位 config。 */
export const SETTINGS_NAMESPACE = 'feishu-cui';

/**
 * 插件条目的 config，也是这三项配置的 schema。
 *
 * 字段都标了 volatile：DSH 0.1.7 起设置由当前 Profile 的插件配置持久化，只有 volatile
 * 字段能被 @deepseek-ai/dsh-settings 的 SettingsForms 写入。写入后 loader 会把新值原地
 * 更新到 apply 收到的 config 上。
 */
export const Config = z.object({
  sessionId: z.string().default('').volatile(),
  userId: z.string().default('').volatile(),
  workspaceId: z.string().default('').volatile(),
  sleepGuardEnabled: z.boolean().default(true).volatile(),
});

/**
 * 绑定宿主设置服务与条目 config，并关掉按 Config 自动生成的设置表单。
 *
 * 这个插件自带设置页（`settings.section` 槽位），不用设置服务再生成一份重复的表单。
 *
 * @param deps.ctx Cordis 上下文
 * @param deps.config apply 收到的条目 config
 * @param deps.logger 日志
 */
export function registerSettings({ ctx, config, logger }) {
  const settings = ctx.get('settings');
  if (!settings) {
    logger.warn('宿主没有设置服务，当前会话、user 与工作区只存在内存里');
    return;
  }
  ctx.effect(() => settings.configure({ auto: false }, ctx.fiber));
  setSettingsHandle({ settings, config });
}

/**
 * 读配置里配的当前会话（原始值，不做「宿主里还在不在」那层判断）。
 *
 * 给启动时那次校验用：校验完由它把结果写进 `cache/current-session.js`。
 *
 * @returns 会话 ID；没配过时为空串
 */
export function readConfiguredSessionId() {
  const { config } = getSettingsHandle() ?? {};
  return readConfigField(config?.sessionId, '');
}

/**
 * 读三项设置。
 *
 * 当前会话取自 `cache/current-session.js`——启动时校验过一次，之后跟着设置一起更新；
 * 另两项直接读配置。
 *
 * @returns `{ sessionId, userId, workspaceId, sleepGuardEnabled }`；前三项没配过时是空串，开关默认开着
 */
export function readSettings() {
  const { config } = getSettingsHandle() ?? {};
  return {
    sessionId: readCurrentSession(),
    userId: readConfigField(config?.userId, ''),
    workspaceId: readConfigField(config?.workspaceId, ''),
    sleepGuardEnabled: readConfigField(config?.sleepGuardEnabled, true) === true,
  };
}

/**
 * 写设置：只改传进来的字段，其余保持原值；写完把当前会话缓存一起更新。
 *
 * @param next `{ sessionId, userId, workspaceId, sleepGuardEnabled }` 里要改的字段
 */
export async function writeSettings(next) {
  const { settings } = getSettingsHandle() ?? {};
  if (!settings) return;
  const merged = { ...readSettings(), ...next };
  await settings.update(SETTINGS_NAMESPACE, merged);
  setCurrentSession(merged.sessionId);
}
