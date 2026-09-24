/** 输入框卡片那套流程的骨架：发卡 / 在册 / 取消 / 提交 / 失效。配对与会话重命名共用。 */

import { clearMenuCard, readMenuCard } from '../../cache/pending-cards.js';
import { cardResponse } from '../../ui/card.js';
import { INPUT_CARD_CANCEL, INPUT_CARD_FIELD_NAME } from '../../ui/input-card.js';
import { buildTextCard } from '../../ui/text-card.js';
import { submitThenCard } from './deferred-submit.js';
import { createPendingCard } from './pending-card.js';

/**
 * 建一套输入框卡片流程。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.key 卡片类型，也是 `cache/pending-cards.js` 里的键
 * @param deps.label 日志里怎么称呼这张卡（「配对卡片」）
 * @param deps.cancelledText 用户点「取消」时回的那句
 * @param deps.staleText 点到不在册的卡时回的那句
 * @param deps.readCard 发卡前读状态拼卡：`() => ({ card })`；回 `{ text }` 表示这次不发卡、只回一句话
 * @param deps.onSubmit 确定时校验并落定：`({ typed, cuiEvent }) => ({ requested, submit } / { card } / { text } / undefined)`；
 *   给 `{ requested, submit }` 时先回 `requested`，`submit` 交后台跑，结果发成一张新卡
 * @param deps.onCancel 取消时调用方要收的尾：`() => void`
 * @returns pushCard / handleCardAction
 */
export function createInputCardFlow({
  logger, push, key, label, cancelledText, staleText, readCard, onSubmit, onCancel,
}) {
  const liveCard = createPendingCard({ logger, push });

  /**
   * 发一张卡给点菜单的人；上一张先作废。
   *
   * @param cuiEvent CUI 事件（点菜单的人从 `cuiEvent.operatorId` 取）
   */
  async function pushCard(cuiEvent) {
    const openId = cuiEvent?.operatorId ?? '';
    if (!openId) {
      logger.warn(`菜单事件里取不到 open_id，${label}没有地方发`);
      return;
    }
    await liveCard.cancel('又发了一张卡');
    const built = await readCard();
    if (built.text !== undefined) {
      await push.sendCard({ openId }, buildTextCard(built.text));
      logger.warn(`${label}没发出去：${built.text}`);
      return;
    }
    const messageId = await push.sendCard({ openId }, built.card);
    liveCard.remember(key, messageId, cancelledText);
    logger.info(`已发出${label}`);
  }

  /**
   * 处理这张卡上的一次点击。
   *
   * @param cuiEvent CUI 事件（按钮在 `cuiEvent.content.value.btn`，用户输的在 `cuiEvent.content.formValue` 里）
   * @returns 换卡响应；不在册的卡片也给响应，把那张换成「已失效」
   */
  async function handleCardAction(cuiEvent) {
    const messageId = cuiEvent?.messageId ?? '';
    if (!messageId || messageId !== readMenuCard().messageId) {
      logger.warn(`忽略已失效的${label}操作：${messageId || '(无消息 ID)'}`);
      return cardResponse(buildTextCard(staleText));
    }

    if (cuiEvent?.content?.value?.btn === INPUT_CARD_CANCEL) {
      onCancel?.();
      clearMenuCard();
      logger.info(`用户取消了${label}`);
      return cardResponse(buildTextCard(cancelledText));
    }

    const typed = cuiEvent?.content?.formValue?.[INPUT_CARD_FIELD_NAME] ?? '';
    const decided = await onSubmit({ typed, cuiEvent });
    clearMenuCard();
    if (decided === undefined) return undefined;
    if (decided.requested !== undefined) {
      const openId = cuiEvent?.operatorId ?? '';
      setTimeout(() => void submitThenCard({ logger, push, label, target: { openId }, decided }), 0);
      return cardResponse(decided.requested);
    }
    return cardResponse(decided.text !== undefined ? buildTextCard(decided.text) : decided.card);
  }

  return { pushCard, handleCardAction };
}
