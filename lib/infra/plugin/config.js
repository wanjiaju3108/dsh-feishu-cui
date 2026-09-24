/** 配置读写：当前会话、user、当前工作区三项，走插件条目的 config。 */

import z from '@deepseek-ai/schemastery';

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
 * 读三项设置。
 *
 * @returns `{ sessionId, userId, workspaceId }`；还没绑定时三项都是空串
 */
export function readSettings() {
  const { config } = getSettingsHandle() ?? {};
  return {
    sessionId: readConfigField(config?.sessionId, ''),
    userId: readConfigField(config?.userId, ''),
    workspaceId: readConfigField(config?.workspaceId, ''),
  };
}

/**
 * 写设置：只改传进来的字段，其余保持原值。
 *
 * @param next `{ sessionId, userId, workspaceId }` 里要改的字段
 */
export async function writeSettings(next) {
  const { settings } = getSettingsHandle() ?? {};
  if (!settings) return;
  const merged = { ...readSettings(), ...next };
  await settings.update(SETTINGS_NAMESPACE, merged);
}
