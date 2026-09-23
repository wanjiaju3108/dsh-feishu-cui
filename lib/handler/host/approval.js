/**
 * 审批卡片：工具要授权时，把这次请求接到飞书来批。
 */

import { hasRunningTurn } from '../../cache/running-turn.js';
import { nextRequestId } from '../../cache/request-id.js';
import { readSettings } from '../../infra/plugin/config.js';
import {
  APPROVAL_ABORTED_TEXT,
  APPROVAL_ALLOWED_TITLE,
  APPROVAL_ALLOW_TEXT,
  APPROVAL_CARD_TITLE,
  APPROVAL_CLOSED_TITLE,
  APPROVAL_ONCE_NOTE,
  APPROVAL_REJECTED_TITLE,
  APPROVAL_REJECT_TEXT,
  APPROVAL_STALE_TEXT,
  APPROVAL_TOOL_LINE,
} from '../../common/copy.js';
import {
  APPROVAL_CARD_BTN_ALLOW,
  APPROVAL_CARD_BTN_REJECT,
  buildApprovalCard,
} from '../../ui/approval-card.js';
import { cardResponse } from '../../ui/card.js';
import { buildHeaderTextCard, buildTextCard } from '../../ui/text-card.js';

/** 审批请求的事件名。 */
export const APPROVAL_REQUEST_EVENT = 'approval/request';

/** 卡片上「允许」按钮交回的决议词（宿主认的那个）。 */
const ALLOWED_ONCE = 'allowed-once';

/** 卡片上「拒绝」按钮交回的决议词。 */
const REJECTED = 'rejected';

/** 这一轮被停掉、请求撤回时交回的词。 */
const CANCELLED = 'cancelled';

/** 允许那张卡的标题栏颜色。 */
const ALLOWED_COLOR = 'green';

/** 拒绝那张卡的标题栏颜色。 */
const REJECTED_COLOR = 'red';

/** 这一轮结束了那张卡的标题栏颜色。 */
const CLOSED_COLOR = 'grey';

/**
 * 建审批处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @returns onRequest / onCardAction 两个处理函数
 */
export function createApprovalHandler({ logger, push }) {
  /** 在册的审批：`requestId` → `{ requestId, cardId, toolName, reason, settle }`。 */
  const pending = new Map();

  /**
   * 审批卡正文的骨架：哪个工具、为什么。
   *
   * @param record 在册的记录
   * @returns markdown 正文的开头那段
   */
  function textOf(record) {
    return [APPROVAL_TOOL_LINE(record.toolName), record.reason].filter(Boolean).join('\n\n');
  }

  /**
   * 待批那张卡：标题栏 + 两个按钮，正文末尾写「允许只对这一次生效」。
   *
   * @param record 在册的记录
   * @returns 卡片对象
   */
  function requestCardOf(record) {
    return buildApprovalCard({
      requestId: record.requestId,
      title: APPROVAL_CARD_TITLE,
      content: `${textOf(record)}\n\n${APPROVAL_ONCE_NOTE}`,
      allowText: APPROVAL_ALLOW_TEXT,
      rejectText: APPROVAL_REJECT_TEXT,
    });
  }

  /**
   * 允许那张卡：绿色标题栏、没按钮，正文跟待批时一样。
   *
   * @param record 在册的记录
   * @returns 卡片对象
   */
  function allowedCardOf(record) {
    return buildHeaderTextCard({
      title: APPROVAL_ALLOWED_TITLE,
      color: ALLOWED_COLOR,
      content: `${textOf(record)}\n\n${APPROVAL_ONCE_NOTE}`,
    });
  }

  /**
   * 拒绝那张卡：红色标题栏、没按钮，正文就是工具和原因。
   *
   * @param record 在册的记录
   * @returns 卡片对象
   */
  function rejectedCardOf(record) {
    return buildHeaderTextCard({
      title: APPROVAL_REJECTED_TITLE,
      color: REJECTED_COLOR,
      content: textOf(record),
    });
  }

  /**
   * 这一轮结束那张卡：灰色标题栏、没按钮，正文末尾写这次为什么作废。
   *
   * @param record 在册的记录
   * @returns 卡片对象
   */
  function closedCardOf(record) {
    return buildHeaderTextCard({
      title: APPROVAL_CLOSED_TITLE,
      color: CLOSED_COLOR,
      content: `${textOf(record)}\n\n${APPROVAL_ABORTED_TEXT}`,
    });
  }

  /** 两个按钮各自交回宿主的决议词，以及批完画哪张卡。 */
  const DECISION_OF_BTN = {
    [APPROVAL_CARD_BTN_ALLOW]: { outcome: ALLOWED_ONCE, cardOf: allowedCardOf },
    [APPROVAL_CARD_BTN_REJECT]: { outcome: REJECTED, cardOf: rejectedCardOf },
  };

  /**
   * 收尾：记录摘掉，把等着的 Promise 交回一个决议词。
   *
   * @param record 在册的记录
   * @param outcome 决议词
   * @returns 这次是我摘掉的时候 true
   */
  function retire(record, outcome) {
    if (!pending.delete(record.requestId)) return false;
    record.settle.resolve(outcome);
    return true;
  }

  /**
   * 这次请求撤回时收尾：交回 `cancelled`，再把卡片改成「已结束」。
   *
   * @param signal 这次请求的取消信号
   * @param record 在册的记录
   */
  function watchAbort(signal, record) {
    if (!signal) return;
    const retireCancelled = async () => {
      if (!retire(record, CANCELLED)) return;
      logger.info(`审批卡片：${record.requestId} 随着这一轮结束作废`);
      await push.patchCard(record.cardId, closedCardOf(record));
    };
    if (signal.aborted) {
      void retireCancelled();
      return;
    }
    signal.addEventListener('abort', () => void retireCancelled(), { once: true });
  }

  /**
   * 宿主来问一次要不要放行。
   *
   * @param request 宿主给的请求
   * @param next 让给下一个回答者
   * @returns 决议词；不接时是下一个回答者的结果
   */
  async function onRequest(request, next) {
    const { sessionId, userId } = readSettings();
    if (!sessionId || !userId) return next();
    if (request?.agent?.id !== sessionId) {
      logger.info(`审批：不是当前会话的请求（${request?.agent?.id || '没有 agent'}），让给网页端`);
      return next();
    }
    if (!hasRunningTurn()) {
      logger.info('审批：这一轮不是飞书这边发起来的，让给网页端');
      return next();
    }

    const requestId = nextRequestId('approval');
    const record = { requestId, cardId: '', toolName: request.toolName, reason: request.reason, settle: undefined };
    const card = requestCardOf(record);
    const answer = new Promise((resolve) => {
      record.settle = { resolve };
    });
    pending.set(requestId, record);
    watchAbort(request.signal, record);

    const cardId = await push.sendCard({ openId: userId }, card);
    if (!cardId) {
      pending.delete(requestId);
      logger.warn('审批：卡片没发出去，让给网页端');
      return next();
    }
    record.cardId = cardId;
    if (!pending.has(requestId)) {
      logger.info(`审批卡片：${requestId} 发出前这一轮就结束了，补一刀作废`);
      await push.patchCard(cardId, closedCardOf(record));
      return answer;
    }
    logger.info(`审批卡片已发出：${requestId}（${request.toolName}，cardId=${cardId}）`);
    return answer;
  }

  /**
   * 卡片上的「允许」「拒绝」：按 `btn` 取决议词，收尾并换卡。
   *
   * @param cuiEvent CUI 事件（卡片按钮的值在 `content.value` 里）
   * @returns 换卡响应
   */
  async function onCardAction(cuiEvent) {
    const { requestId, btn } = cuiEvent?.content?.value ?? {};
    const record = pending.get(requestId);
    if (!record) {
      logger.info(`审批卡片：${requestId || '(没有 requestId)'} 不在册上`);
      return cardResponse(buildTextCard(APPROVAL_STALE_TEXT));
    }

    const decision = DECISION_OF_BTN[btn];
    if (!decision) {
      logger.info(`审批卡片：${requestId} 上认不出的按钮 ${btn || '(没有 btn)'}`);
      return undefined;
    }
    if (!retire(record, decision.outcome)) return undefined;
    logger.info(`审批卡片：${requestId} ${decision.outcome}`);
    return cardResponse(decision.cardOf(record));
  }

  return { onRequest, onCardAction };
}
