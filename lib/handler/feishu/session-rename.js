/** 会话重命名：菜单里点「会话重命名」时发一张输入框卡片，填完点「确定」改当前会话的名字。 */

import { clearMenuCard, readMenuCard } from '../../cache/pending-cards.js';
import { readSettings } from '../../infra/plugin/config.js';
import { cardResponse } from '../../ui/card.js';
import { INPUT_CARD_CANCEL, INPUT_CARD_FIELD_NAME, buildInputCard } from '../../ui/input-card.js';
import { buildTextCard } from '../../ui/text-card.js';
import { createPendingCard } from './pending-card.js';
import {
  CANCEL_TEXT,
  CONFIRM_TEXT,
  NO_CURRENT_SESSION_TEXT,
  SESSION_RENAMED_TEXT,
  SESSION_RENAME_CANCELLED_TEXT,
  SESSION_RENAME_CARD_DESCRIPTION,
  SESSION_RENAME_CARD_PLACEHOLDER,
  SESSION_RENAME_CARD_TITLE,
  SESSION_RENAME_FAILED_TEXT,
  SESSION_RENAME_STALE_TEXT,
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
  const liveCard = createPendingCard({ logger, push });

  /**
   * 发输入框卡片：用户点菜单「会话重命名」时走这里；还没有当前会话就只回一句话。
   *
   * @param cuiEvent CUI 事件（点菜单的人从 `cuiEvent.operatorId` 取）
   */
  async function pushSessionRename(cuiEvent) {
    const openId = cuiEvent?.operatorId ?? '';
    if (!openId) {
      logger.warn('菜单事件里取不到 open_id，重命名卡片没有地方发');
      return;
    }
    if (!readSettings().sessionId) {
      await push.sendCard({ openId }, buildTextCard(NO_CURRENT_SESSION_TEXT));
      logger.warn(`重命名卡片没发出去：${NO_CURRENT_SESSION_TEXT}`);
      return;
    }
    await liveCard.cancel('又发了一张卡');
    const messageId = await push.sendCard({ openId }, buildInputCard({
      tag: SESSION_RENAME_KEY,
      title: SESSION_RENAME_CARD_TITLE,
      description: SESSION_RENAME_CARD_DESCRIPTION,
      placeholder: SESSION_RENAME_CARD_PLACEHOLDER,
      confirmText: CONFIRM_TEXT,
      cancelText: CANCEL_TEXT,
    }));
    liveCard.remember(SESSION_RENAME_KEY, messageId, SESSION_RENAME_CANCELLED_TEXT);
    logger.info('已发出会话重命名卡片');
  }

  /**
   * 改当前会话的名字：用户在卡片上点「取消」就把这次作废，点「确定」就把表单里填的新名字交给宿主。
   *
   * @param cuiEvent CUI 事件（按钮在 `content.value.btn`，用户输的在 `content.formValue` 里）
   * @returns 换卡响应
   */
  async function handleSessionRenameCard(cuiEvent) {
    const messageId = cuiEvent?.messageId ?? '';
    if (!messageId || messageId !== readMenuCard().messageId) {
      logger.warn(`忽略已失效的重命名卡片操作：${messageId || '(无消息 ID)'}`);
      return cardResponse(buildTextCard(SESSION_RENAME_STALE_TEXT));
    }

    if (cuiEvent?.content?.value?.btn === INPUT_CARD_CANCEL) {
      clearMenuCard();
      logger.info('会话重命名已取消');
      return cardResponse(buildTextCard(SESSION_RENAME_CANCELLED_TEXT));
    }

    const { sessionId } = readSettings();
    if (!sessionId) {
      clearMenuCard();
      logger.warn('提交重命名时没有当前会话，这次提交不处理');
      return cardResponse(buildTextCard(NO_CURRENT_SESSION_TEXT));
    }

    const typed = cuiEvent?.content?.formValue?.[INPUT_CARD_FIELD_NAME] ?? '';
    const renamed = await catalog.rename({ sessionId, title: typed });
    clearMenuCard();
    if (!renamed.ok) {
      logger.warn(`会话 ${sessionId} 改名没成：${renamed.error}`);
      return cardResponse(buildTextCard(SESSION_RENAME_FAILED_TEXT));
    }
    logger.info(`会话 ${sessionId} 已改名为「${renamed.title}」`);
    return cardResponse(buildTextCard(SESSION_RENAMED_TEXT(renamed.title)));
  }

  return { pushSessionRename, handleSessionRenameCard };
}
