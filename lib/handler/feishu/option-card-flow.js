/** 选择卡片那套流程的骨架：发卡 / 在册 / 点行 / 确定 / 取消 / 失效。 */

import { clearMenuCard, readMenuCard } from '../../cache/pending-cards.js';
import { CARD_BUTTON_CANCEL, CARD_BUTTON_CONFIRM, cardResponse } from '../../ui/card.js';
import { OPTION_CARD_PICK } from '../../ui/option-card.js';
import { buildTextCard } from '../../ui/text-card.js';
import { createPendingCard } from './pending-card.js';

/**
 * 建一套选择卡片流程。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.key 卡片类型，也是 `cache/pending-cards.js` 里的键
 * @param deps.label 日志里怎么称呼这张卡（「工作区列表卡片」）
 * @param deps.cancelledText 取消 / 没选就确定时那句
 * @param deps.staleText 点到不在册的卡时那句
 * @param deps.readCard 读状态拼卡
 * @param deps.onConfirm 确定时校验并落定
 * @param deps.onExtraButton 卡片上除 点行 / 确定 / 取消 之外的按钮：`(btn) => 上面那几种返回`
 * @returns pushCard / handleCardAction
 */
export function createOptionCardFlow({
  logger,
  push,
  key,
  label,
  cancelledText,
  staleText,
  readCard,
  onConfirm,
  onExtraButton,
}) {
  /**
   * 把 `readCard` 的结果变成一张能直接回给飞书的卡片（`{ text }` 会包成纯文本卡）。
   *
   * @param params `readCard` 的参数
   * @returns 卡片对象
   */
  async function repaint(params) {
    const built = await readCard(params);
    return built.text !== undefined ? buildTextCard(built.text) : built.card;
  }

  const liveCard = createPendingCard({ logger, push });

  /**
   * 发一张卡给点菜单的人；上一张先作废。
   *
   * @param cuiEvent CUI 事件（点菜单的人从 `cuiEvent.operatorId` 取）
   */
  async function pushCard(cuiEvent) {
    const openId = cuiEvent?.operatorId ?? '';
    await liveCard.cancel('又发了一张卡');
    const built = await readCard({});
    if (built.text !== undefined) {
      await push.sendCard({ openId }, buildTextCard(built.text));
      logger.warn(`${label}没发出去：${built.text}`);
      return;
    }
    const messageId = await push.sendCard({ openId }, built.card);
    liveCard.remember(key, messageId, cancelledText);
    logger.info(`已发出${label}${built.detail ? `，${built.detail}` : ''}`);
  }

  /**
   * 处理这张卡上的一次点击。
   *
   * @param cuiEvent CUI 事件（按钮在 `cuiEvent.content.value` 里）
   * @returns 换卡响应；不在册的卡片也给响应，把那张换成「已失效」
   */
  async function handleCardAction(cuiEvent) {
    const messageId = cuiEvent?.messageId ?? '';
    const value = cuiEvent?.content?.value ?? {};
    const pick = typeof value.value === 'string' ? value.value : '';

    if (!messageId || messageId !== readMenuCard().messageId) {
      logger.warn(`忽略已失效的${label}操作：${messageId || '(无消息 ID)'}`);
      return cardResponse(buildTextCard(staleText));
    }

    if (value.btn === CARD_BUTTON_CANCEL) {
      clearMenuCard();
      logger.info(`用户取消了${label}上的选择`);
      return cardResponse(buildTextCard(cancelledText));
    }

    if (value.btn === OPTION_CARD_PICK) {
      return cardResponse(await repaint({ selected: pick }));
    }

    if (value.btn === CARD_BUTTON_CONFIRM) {
      if (!pick) {
        clearMenuCard();
        logger.info('没选就点了确定，按取消处理');
        return cardResponse(buildTextCard(cancelledText));
      }
      const decided = await onConfirm({ pick });
      if (decided === undefined) return undefined;
      if (decided.error !== undefined) {
        return cardResponse(await repaint({ selected: pick, error: decided.error }));
      }
      clearMenuCard();
      if (decided.requested !== undefined) {
        setTimeout(() => void submitThenPatch(decided, messageId), 0);
        return cardResponse(decided.requested);
      }
      return cardResponse(decided.text !== undefined ? buildTextCard(decided.text) : decided.card);
    }

    if (onExtraButton !== undefined) {
      const decided = await onExtraButton(value.btn);
      if (decided !== undefined) {
        if (decided.error !== undefined) return cardResponse(await repaint({ error: decided.error }));
        clearMenuCard();
        return cardResponse(decided.text !== undefined ? buildTextCard(decided.text) : decided.card);
      }
    }

    logger.warn(`${label}上没有这个按钮：${value.btn || '(无 btn)'}`);
    return undefined;
  }

  /**
   * 后台提交，再把结果补到那张卡上。
   *
   * @param decided `{ submit }`（`onConfirm` 给的那一份）
   * @param messageId 卡片所在的飞书消息 ID
   */
  async function submitThenPatch(decided, messageId) {
    let after;
    try {
      after = await decided.submit();
    } catch (error) {
      logger.warn(`${label}提交失败：${error?.message ?? error}`);
      after = { text: String(error?.message ?? error) };
    }
    if (after === undefined) return;
    const line = after.text !== undefined ? after.text : after.error;
    const card = line !== undefined ? buildTextCard(line) : after.card;
    if (card === undefined) return;
    await push.patchCard(messageId, card);
  }

  return { pushCard, handleCardAction };
}
