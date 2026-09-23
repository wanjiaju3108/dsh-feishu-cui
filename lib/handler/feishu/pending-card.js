/** 在册卡片：作废上一张、记下新的一张。 */

import { clearMenuCard, readMenuCard, setMenuCard } from '../../cache/pending-cards.js';
import { buildTextCard } from '../../ui/text-card.js';

/**
 * 建在册卡片处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.onCancel 作废一张卡之后的收尾：`(tag) => void`
 * @returns cancel / remember
 */
export function createPendingCard({ logger, push, onCancel }) {
  /**
   * 作废在册的那张卡：换成它自己那句「已取消」。
   *
   * @param reason 作废原因（只进日志）
   */
  async function cancel(reason) {
    const { tag, messageId, cancelText } = readMenuCard();
    clearMenuCard();
    if (!messageId) return;
    logger.info(`在册卡片已作废（${tag || '(无 tag)'}）：${reason}`);
    onCancel?.(tag);
    await push.patchCard(messageId, buildTextCard(cancelText));
  }

  /**
   * 记下刚发出去的那张卡。
   *
   * @param tag 卡片类型
   * @param messageId 飞书消息 ID
   * @param cancelText 这张卡被顶掉时写在它上面的那句话
   */
  function remember(tag, messageId, cancelText) {
    setMenuCard(tag, messageId, cancelText);
  }

  return { cancel, remember };
}
