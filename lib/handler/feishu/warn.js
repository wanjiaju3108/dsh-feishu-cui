/** 判定没通过时的那两件事：`code 1` 记一行日志，`code 2` 把原因回给用户。 */

import { clearMenuCard, readMenuCard } from '../../cache/pending-cards.js';
import { cardResponse } from '../../ui/card.js';
import { buildTextCard } from '../../ui/text-card.js';

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

    const card = buildTextCard(verdict.reason);
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
