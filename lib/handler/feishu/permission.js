/** 权限卡片：菜单里点「权限」时发卡，卡片上点行 / 确定 / 取消时接着办。 */

import {
  CANCEL_TEXT,
  CONFIRM_TEXT,
  NO_CURRENT_SESSION_TEXT,
  PERMISSION_CANCELLED_TEXT,
  PERMISSION_CARD_EMPTY_TEXT,
  PERMISSION_CARD_SUMMARY,
  PERMISSION_CARD_TITLE,
  PERMISSION_STALE_TEXT,
  PERMISSION_REQUESTED_TEXT,
  PERMISSION_UNKNOWN_PRESET_TEXT,
  UNKNOWN_VALUE_TEXT,
} from '../../copy.js';
import { readSettings } from '../../infra/plugin/config.js';
import { buildOptionCard } from '../../ui/option-card.js';
import { buildTextCard } from '../../ui/text-card.js';
import { createOptionCardFlow } from './option-card-flow.js';

/** 这个菜单项的 `event_key`，也是卡片的类型。 */
export const PERMISSION_KEY = 'permission';

/**
 * 建权限卡片处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.permissions 权限预设封装（`infra/host/permissions.js` 的 `createPermissions`）
 * @returns pushPermissionCard / handlePermissionCard
 */
export function createPermissionHandler({ logger, push, permissions }) {
  /**
   * 读预设清单和当前会话生效的那个，拼一张权限卡片。
   *
   * @param deps.selected 当前勾着的那一行的预设名
   * @param deps.error 写回正文最上面的那句话
   * @returns `{ card, detail }`，或 `{ text }`（没有当前会话 / 宿主一个可用预设都没有）
   */
  async function readCard({ selected, error }) {
    const { sessionId } = readSettings();
    if (!sessionId) return { text: NO_CURRENT_SESSION_TEXT };
    const options = permissions.options();
    if (options.length === 0) return { text: PERMISSION_CARD_EMPTY_TEXT };

    const current = await permissions.current(sessionId);
    const summary = PERMISSION_CARD_SUMMARY(current ? permissions.labelOf(current) : UNKNOWN_VALUE_TEXT);
    return {
      card: buildOptionCard({
        tag: PERMISSION_KEY,
        requestId: '',
        title: PERMISSION_CARD_TITLE,
        notice: '',
        groups: [{ id: '', text: error ? `${error}\n${summary}` : summary, options }],
        picked: new Map([['', selected ?? current ?? '']]),
        confirmText: CONFIRM_TEXT,
        cancelText: CANCEL_TEXT,
      }),
      detail: `共 ${options.length} 个预设，当前 ${current ?? '(读不到)'}`,
    };
  }

  const flow = createOptionCardFlow({
    logger,
    push,
    key: PERMISSION_KEY,
    label: '权限卡片',
    cancelledText: PERMISSION_CANCELLED_TEXT,
    staleText: PERMISSION_STALE_TEXT,
    readCard,

    /**
     * 确定：先把回传的预设名验一遍，再写会话级权限。
     *
     * @param deps.pick 选中的预设名
     * @returns `{ requested, submit }`，或 `{ text }` / `{ error }`
     */
    onConfirm: async ({ pick }) => {
      if (!permissions.available().includes(pick)) {
        logger.warn(`卡片回传了未知预设 ${pick}，已回绝`);
        return { error: PERMISSION_UNKNOWN_PRESET_TEXT(pick) };
      }
      const { sessionId } = readSettings();
      if (!sessionId) return { text: NO_CURRENT_SESSION_TEXT };

      return {
        requested: buildTextCard(PERMISSION_REQUESTED_TEXT(permissions.labelOf(pick) ?? pick)),
        submit: async () => {
          const result = await permissions.set(sessionId, pick);
          if (!result.ok) return { error: result.error };
          logger.info(`已请求把当前会话的权限改成 ${pick}`);
          return undefined;
        },
      };
    },
  });

  return { pushPermissionCard: flow.pushCard, handlePermissionCard: flow.handleCardAction };
}
