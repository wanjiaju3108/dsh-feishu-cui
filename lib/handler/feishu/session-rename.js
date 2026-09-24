/** 会话重命名：菜单里点「会话重命名」时发一张输入框卡片，填完点「确定」改当前会话的名字。骨架走 `input-card-flow.js`。 */

import { readSettings } from '../../infra/plugin/config.js';
import { buildInputCard } from '../../ui/input-card.js';
import { buildTextCard } from '../../ui/text-card.js';
import { createInputCardFlow } from './input-card-flow.js';
import {
  CANCEL_TEXT,
  CONFIRM_TEXT,
  INPUT_CARD_STALE_TEXT,
  NO_CURRENT_SESSION_TEXT,
  SESSION_RENAME_CANCELLED_TEXT,
  SESSION_RENAME_CARD_DESCRIPTION,
  SESSION_RENAME_CARD_PLACEHOLDER,
  SESSION_RENAME_CARD_TITLE,
  SESSION_RENAME_FAILED_TEXT,
  SESSION_RENAME_REQUESTED_TEXT,
} from '../../common/copy.js';

/** 这个菜单项的 `event_key`，也是输入框卡片的卡片类型。 */
export const SESSION_RENAME_KEY = 'session-rename';

/**
 * 建会话重命名处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.catalog 会话目录（`infra/host/session.js` 的 `createSessionCatalog`）
 * @returns pushSessionRename / handleSessionRenameCard
 */
export function createSessionRenameHandler({ logger, push, catalog }) {
  const flow = createInputCardFlow({
    logger,
    push,
    key: SESSION_RENAME_KEY,
    label: '重命名卡片',
    cancelledText: SESSION_RENAME_CANCELLED_TEXT,
    staleText: INPUT_CARD_STALE_TEXT,

    /**
     * 有当前会话才发输入框卡片，没有就只回一句话。
     *
     * @returns `{ card }` 或 `{ text }`
     */
    readCard: async () => (readSettings().sessionId ? {
      card: buildInputCard({
        tag: SESSION_RENAME_KEY,
        title: SESSION_RENAME_CARD_TITLE,
        description: SESSION_RENAME_CARD_DESCRIPTION,
        placeholder: SESSION_RENAME_CARD_PLACEHOLDER,
        confirmText: CONFIRM_TEXT,
        cancelText: CANCEL_TEXT,
      }),
    } : { text: NO_CURRENT_SESSION_TEXT }),

    /**
     * 确定：先回一句「已请求」，把改名交给后台，结果补回那张卡。
     *
     * @param deps.typed 用户在输入框里填的内容
     * @returns `{ requested, submit }`，或 `{ text }`
     */
    onSubmit: async ({ typed }) => {
      const { sessionId } = readSettings();
      if (!sessionId) {
        logger.warn('提交重命名时没有当前会话，这次提交不处理');
        return { text: NO_CURRENT_SESSION_TEXT };
      }

      return {
        requested: buildTextCard(SESSION_RENAME_REQUESTED_TEXT(typed)),
        submit: async () => {
          const renamed = await catalog.rename({ sessionId, title: typed });
          if (!renamed.ok) {
            logger.warn(`会话 ${sessionId} 改名没成：${renamed.error}`);
            return { error: SESSION_RENAME_FAILED_TEXT };
          }
          logger.info(`会话 ${sessionId} 已改名为「${renamed.title}」`);
          return undefined;
        },
      };
    },
  });

  return { pushSessionRename: flow.pushCard, handleSessionRenameCard: flow.handleCardAction };
}
