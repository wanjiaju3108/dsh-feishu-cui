/** 判定没通过时的那两件事：`code 1` 记一行日志，`code 2` 把原因回给用户。 */

import { clearMenuCard, readMenuCard } from '../../cache/pending-cards.js';
import {
  NO_CURRENT_SESSION_TEXT,
  NOT_MATCHED_TEXT,
  SESSION_SWITCH_BUSY_TEXT,
  UNSUPPORTED_MESSAGE_TEXT,
  WORKSPACE_SWITCH_BUSY_TEXT,
} from '../../copy.js';
import { cardResponse } from '../../ui/card.js';
import { buildTextCard } from '../../ui/text-card.js';

/** 判定没通过的原因：发消息 / 点卡片的不是绑定的那个人。 */
export const NOT_MATCHED_REASON = 'not-matched';

/** 判定没通过的原因：还没有当前会话。 */
export const NO_SESSION_REASON = 'no-session';

/** 判定没通过的原因：不是文本消息。 */
export const UNSUPPORTED_MESSAGE_REASON = 'unsupported-message';

/** 判定没通过的原因：有活没干完，不让切会话。 */
export const SESSION_SWITCH_BUSY_REASON = 'session-switch-busy';

/** 判定没通过的原因：有活没干完，不让换工作区。 */
export const WORKSPACE_SWITCH_BUSY_REASON = 'workspace-switch-busy';

/** 判定没通过时卡片上写什么：按原因查。 */
const REASON_TEXT = {
  [NOT_MATCHED_REASON]: NOT_MATCHED_TEXT,
  [NO_SESSION_REASON]: NO_CURRENT_SESSION_TEXT,
  [UNSUPPORTED_MESSAGE_REASON]: UNSUPPORTED_MESSAGE_TEXT,
  [SESSION_SWITCH_BUSY_REASON]: SESSION_SWITCH_BUSY_TEXT,
  [WORKSPACE_SWITCH_BUSY_REASON]: WORKSPACE_SWITCH_BUSY_TEXT,
};

/**
 * 建判定回话件。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @returns handle
 */
export function createWarnHandler({ logger, push }) {
  /**
   * 处理一次没通过的判定。
   *
   * @param verdict 判定：`{ code, reason }`
   * @param cuiEvent CUI 事件
   * @returns 换卡响应（卡片回调时）；其余情况 undefined
   */
  async function handle(verdict, cuiEvent) {
    if (verdict.code === 1) {
      logger.warn(`飞书事件丢弃：${verdict.reason}`);
      return undefined;
    }

    const card = buildTextCard(REASON_TEXT[verdict.reason] ?? verdict.reason);
    if (cuiEvent?.event === 'card') {
      if (cuiEvent.messageId && readMenuCard().messageId === cuiEvent.messageId) clearMenuCard();
      logger.info(`卡片操作被挡下，已就地换卡：${verdict.reason}`);
      return cardResponse(card);
    }

    const target = cuiEvent?.messageId
      ? { messageId: cuiEvent.messageId }
      : { openId: cuiEvent?.operatorId ?? '' };
    await push.sendCard(target, card);
    logger.info(`判定回话已发出：${verdict.reason}`);
    return undefined;
  }

  return { handle };
}
