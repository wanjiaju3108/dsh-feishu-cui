/**
 * 「当前会话」的模型 / 推理深度 / 权限 / 会话名被改了时，往飞书发一张通知卡。
 */

import {
  PERMISSION_PRESET_LABELS,
  SETTINGS_CHANGED_EFFORT,
  SETTINGS_CHANGED_MODEL,
  SETTINGS_CHANGED_PERMISSION,
  SETTINGS_CHANGED_PERMISSION_TITLE,
  SETTINGS_CHANGED_MODEL_TITLE,
  SETTINGS_CHANGED_SESSION_NAME,
  SETTINGS_CHANGED_SESSION_NAME_TITLE,
  UNKNOWN_LABEL_TEXT,
} from '../../common/copy.js';
import { readSettings } from '../../infra/plugin/config.js';
import { buildHeaderTextCard } from '../../ui/text-card.js';

/** 模型选择事件的 tag 值。 */
export const MODEL_SELECTION_EVENT = 'model/selection';

/** 权限预设事件的 tag 值。 */
export const PERMISSION_PRESET_EVENT = 'permission/preset';

/** 会话名事件的 tag 值。 */
export const SESSION_TITLE_EVENT = 'session/title';

/** 会话名事件里「人手动改名」的 `source.kind`；自动生成的标题是别的值。 */
export const USER_TITLE_SOURCE = 'user';

/** 要盯的会话事件：模型选择、权限预设、会话名。 */
export const WATCHED_SESSION_EVENTS = [
  MODEL_SELECTION_EVENT,
  PERMISSION_PRESET_EVENT,
  SESSION_TITLE_EVENT,
];

/**
 * 建会话设置监视器。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.models 模型目录封装（`infra/host/models.js` 的 `createModelCatalog`）
 * @param deps.permissions 权限预设封装（`infra/host/permissions.js` 的 `createPermissions`）
 * @returns onSession
 */
export function createSettingsWatch({ logger, push, models, permissions }) {
  /**
   * 把一条设置事件翻译成「标题 + 正文几行」。
   *
   * @param internal 内部事件（值在 `internal.settings` 里）
   * @returns `{ title, lines }`；不是我们盯的事件时 undefined
   */
  async function noticeOf(internal) {
    const settings = internal.settings ?? {};
    if (internal.tag === MODEL_SELECTION_EVENT) {
      const listed = await models.catalog();
      const group = listed?.groups?.find((item) => item.id === settings.provider);
      const model = group?.models?.find((item) => item.id === settings.model);
      const lines = [SETTINGS_CHANGED_MODEL(model?.name ?? settings.model ?? UNKNOWN_LABEL_TEXT)];
      if (settings.reasoningEffort) {
        const effort = model?.reasoning?.efforts?.find((item) => item.id === settings.reasoningEffort);
        lines.push(SETTINGS_CHANGED_EFFORT(effort?.name ?? settings.reasoningEffort));
      }
      return { title: SETTINGS_CHANGED_MODEL_TITLE, lines };
    }
    if (internal.tag === PERMISSION_PRESET_EVENT) {
      const preset = settings.preset ?? '';
      const label = preset ? (PERMISSION_PRESET_LABELS[preset] ?? permissions.displayNameOf(preset)) : UNKNOWN_LABEL_TEXT;
      return { title: SETTINGS_CHANGED_PERMISSION_TITLE, lines: [SETTINGS_CHANGED_PERMISSION(label)] };
    }
    if (internal.tag === SESSION_TITLE_EVENT) {
      // 自动标题（provider / fallback）也走这条事件，只有人手动改名才值得通知。
      if (settings.source?.kind !== USER_TITLE_SOURCE) return undefined;
      return {
        title: SETTINGS_CHANGED_SESSION_NAME_TITLE,
        lines: [SETTINGS_CHANGED_SESSION_NAME(settings.title ?? UNKNOWN_LABEL_TEXT)],
      };
    }
    return undefined;
  }

  /**
   * 发一条通知。
   *
   * @param internal 内部事件
   */
  async function notify(internal) {
    const { sessionId, userId } = readSettings();
    if (!sessionId || !userId) return;
    let notice;
    try {
      notice = await noticeOf(internal);
    } catch (error) {
      logger.warn(`读这次设置变化失败，跳过通知：${error?.message ?? error}`);
      return;
    }
    if (notice === undefined) return;
    logger.info(`会话设置被改了，通知绑定的人：${notice.title} ${notice.lines.join('；')}`);
    await push.sendCard(
      { openId: userId },
      buildHeaderTextCard({ title: notice.title, color: 'blue', content: notice.lines.join('\n') }),
    );
  }

  /**
   * 收一条会话事件：是我们盯的那几种就发一条通知。
   *
   * @param internal 内部事件
   */
  function onSession(internal) {
    if (!WATCHED_SESSION_EVENTS.includes(internal.tag)) return;
    void notify(internal);
  }

  return { onSession };
}
