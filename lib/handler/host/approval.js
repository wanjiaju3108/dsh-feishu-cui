/**
 * 审批卡片：工具要授权时，把这次请求接到飞书来批。
 */

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
import { buildHeaderTextCard } from '../../ui/text-card.js';
import { createWaterfallFlow } from './waterfall.js';

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
   * 接这次审批：接了就把在册记录和待批那张卡一起给出来。
   *
   * @param deps.request 宿主给的请求
   * @param deps.requestId 这次请求的身份
   * @returns `{ record, card }`
   */
  function prepare({ request, requestId }) {
    const record = { requestId, cardId: '', toolName: request.toolName, reason: request.reason, settle: undefined };
    return { record, card: requestCardOf(record) };
  }

  /**
   * 卡片上的「允许」「拒绝」：按 `btn` 取决议词，收尾并换卡。
   *
   * @param record 在册的记录
   * @param cuiEvent CUI 事件（卡片按钮的值在 `content.value` 里）
   * @returns 换卡响应
   */
  async function handleAction(record, cuiEvent) {
    const { requestId, btn } = cuiEvent?.content?.value ?? {};

    const decision = DECISION_OF_BTN[btn];
    if (!decision) {
      logger.info(`审批卡片：${requestId} 上认不出的按钮 ${btn || '(没有 btn)'}`);
      return undefined;
    }
    if (!flow.drop(requestId)) return undefined;
    logger.info(`审批卡片：${requestId} ${decision.outcome}`);
    record.settle.resolve(decision.outcome);
    return cardResponse(decision.cardOf(record));
  }

  const flow = createWaterfallFlow({
    logger,
    push,
    kind: 'approval',
    name: '审批',
    staleText: APPROVAL_STALE_TEXT,
    describe: (record) => record.toolName,
    prepare,
    abort: (record) => record.settle.resolve(CANCELLED),
    closedCardOf,
    handleAction,
  });

  return { onRequest: flow.onRequest, onCardAction: flow.onCardAction };
}
