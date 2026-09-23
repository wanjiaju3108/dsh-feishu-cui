/**
 * 「要人答」两条口（反问 `user-questions/request`、审批 `approval/request`）共用的骨架：
 * 接请求时的检查、在册、挂 promise、发卡与竞态、这一轮停了就作废。
 */

import { hasRunningTurn } from '../../cache/running-turn.js';
import { nextRequestId } from '../../cache/request-id.js';
import { readSettings } from '../../infra/plugin/config.js';
import { cardResponse } from '../../ui/card.js';
import { buildTextCard } from '../../ui/text-card.js';

/**
 * 建一条「要人答」的口。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.kind 铸号用的种类（`question` / `approval`）
 * @param deps.name 日志里怎么称呼这条口（`反问` / `审批`）
 * @param deps.staleText 点到不在册的卡时回的那句话
 * @param deps.describe 交出去的记录怎么描述（进日志）
 * @param deps.prepare 接不接这次请求：`({ request, requestId, userId }) => { record, card }`；
 *   不接时返回 undefined（要不要先回一句话、回什么，各家自己办）
 * @param deps.abort 这一轮被停掉时怎么交回：`(record) => void`
 * @param deps.closedCardOf 这一轮结束了那张卡：`(record) => 卡片对象`
 * @param deps.handleAction 卡片点下去怎么办：`(record, cuiEvent) => 换卡响应`
 * @returns onRequest / onCardAction / drop
 */
export function createWaterfallFlow({
  logger, push, kind, name, staleText, describe, prepare, abort, closedCardOf, handleAction,
}) {
  /** 日志里那张卡的名字。 */
  const cardName = `${name}卡片`;

  /** 在册的记录：`requestId` → 各家自己那份 record。 */
  const pending = new Map();

  /**
   * 把一条记录从在册表上摘掉。
   *
   * @param requestId 这次请求的身份
   * @returns 这次是我摘掉的时候 true
   */
  function drop(requestId) {
    return pending.delete(requestId);
  }

  /**
   * 这一轮被停掉时收尾：摘记录、按各家给的方式交回，再把卡片改成「已结束」。
   *
   * @param signal 这次请求的取消信号
   * @param record 在册的记录
   */
  function watchAbort(signal, record) {
    if (!signal) return;
    const retireAborted = async () => {
      if (!drop(record.requestId)) return;
      abort(record);
      logger.info(`${cardName}：${record.requestId} 随着这一轮结束作废`);
      await push.patchCard(record.cardId, closedCardOf(record));
    };
    if (signal.aborted) {
      void retireAborted();
      return;
    }
    signal.addEventListener('abort', () => void retireAborted(), { once: true });
  }

  /**
   * 宿主来要人答一次。
   *
   * @param request 宿主给的请求（`{ agent, signal, ... }`）
   * @param next 让给下一个回答者
   * @returns 答案；不接时是下一个回答者的结果
   */
  async function onRequest(request, next) {
    const { sessionId, userId } = readSettings();
    if (!sessionId || !userId) return next();
    if (request?.agent?.id !== sessionId) {
      logger.info(`${name}：不是当前会话发起的（${request?.agent?.id || '没有 agent'}），让给网页端`);
      return next();
    }
    if (!hasRunningTurn()) {
      logger.info(`${name}：这一轮不是飞书这边发起来的，让给网页端`);
      return next();
    }

    const requestId = nextRequestId(kind);
    const prepared = await prepare({ request, requestId, userId });
    if (prepared === undefined) return next();
    const { record, card } = prepared;

    const answer = new Promise((resolve, reject) => {
      record.settle = { resolve, reject };
    });
    pending.set(requestId, record);
    watchAbort(request.signal, record);

    const cardId = await push.sendCard({ openId: userId }, card);
    if (!cardId) {
      drop(requestId);
      logger.warn(`${name}：卡片没发出去，让给网页端`);
      return next();
    }
    record.cardId = cardId;
    if (!pending.has(requestId)) {
      logger.info(`${cardName}：${requestId} 发出前这一轮就结束了，补一刀作废`);
      await push.patchCard(cardId, closedCardOf(record));
      return answer;
    }
    logger.info(`${cardName}已发出：${requestId}（${describe(record)}，cardId=${cardId}）`);
    return answer;
  }

  /**
   * 卡片上的点击：不在册的回一句话，在册的交给各家。
   *
   * @param cuiEvent CUI 事件（卡片按钮的值在 `content.value` 里）
   * @returns 换卡响应
   */
  async function onCardAction(cuiEvent) {
    const { requestId } = cuiEvent?.content?.value ?? {};
    const record = pending.get(requestId);
    if (!record) {
      logger.info(`${cardName}：${requestId || '(没有 requestId)'} 不在册上`);
      return cardResponse(buildTextCard(staleText));
    }
    return await handleAction(record, cuiEvent);
  }

  return { onRequest, onCardAction, drop };
}
