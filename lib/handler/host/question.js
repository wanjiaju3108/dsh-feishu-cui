/**
 * 反问卡片：agent 调 `ask_user_question` 时，把题目接到飞书来答。
 */

import {
  CANCEL_TEXT,
  CONFIRM_TEXT,
  QUESTION_ABORTED_TEXT,
  QUESTION_CANCELLED_TEXT,
  QUESTION_CANCELLED_TITLE,
  QUESTION_CARD_TITLE,
  QUESTION_CLOSED_TITLE,
  QUESTION_DONE_LINE,
  QUESTION_DONE_TITLE,
  QUESTION_FALLBACK_HEADER,
  QUESTION_SKIPPED_LABEL,
  QUESTION_STALE_TEXT,
  QUESTION_UNSUPPORTED_TEXT,
} from '../../common/copy.js';
import { CARD_BUTTON_CANCEL, CARD_BUTTON_CONFIRM, CARD_MAX_BYTES, cardBytes, cardResponse } from '../../ui/card.js';
import { OPTION_CARD_PICK, buildOptionCard } from '../../ui/option-card.js';
import { buildHeaderTextCard, buildTextCard } from '../../ui/text-card.js';
import { createWaterfallFlow } from './waterfall.js';

/** 宿主 `UserQuestionError` 的名字。 */
export const USER_QUESTION_ERROR_NAME = 'UserQuestionError';

/** 反问请求的事件名。 */
export const USER_QUESTIONS_EVENT = 'user-questions/request';

/** 卡片类型，也是回调里 `action.value.tag` 的那个值。 */
export const QUESTION_CARD_KEY = 'question';

/** 这次提问的作废原因：被停掉。 */
const ASK_ABORTED = 'ASK_ABORTED';

/** 这次提问的作废原因：人自己点了「取消」。 */
const ASK_CANCELLED = 'ASK_CANCELLED';

/**
 * 这批题飞书能不能答：每题都得有选项，且都不是多选。
 *
 * @param questions 宿主给的题目
 * @returns 能答时 true
 */
function answerable(questions) {
  return Array.isArray(questions)
    && questions.length > 0
    && questions.every((question) =>
      Array.isArray(question?.options) && question.options.length > 0 && question.multiSelect !== true);
}

/**
 * 建反问处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @returns onRequest / onCardAction 两个处理函数
 */
export function createQuestionHandler({ logger, push }) {
  /**
   * 把题目摊成选项卡要的「组」：一组一道题，组里那段文字是抬头 + 题面（+ 宿主给的 detail）。
   *
   * @param record 在册的记录
   * @returns 组列表
   */
  function groupsOf(record) {
    return record.questions.map((question, index) => {
      const lines = [`**${question.header ?? QUESTION_FALLBACK_HEADER(index)}**`, '', question.question];
      if (question.detail) lines.push('', question.detail);
      return {
        id: question.id,
        text: lines.join('\n'),
        options: (question.options ?? []).map((option) => ({
          label: option.label,
          description: option.description,
          value: option.label,
        })),
      };
    });
  }

  /**
   * 照记录画一张反问卡。
   *
   * @param record 在册的记录
   * @returns 卡片对象
   */
  function cardOf(record) {
    return buildOptionCard({
      tag: QUESTION_CARD_KEY,
      requestId: record.requestId,
      title: QUESTION_CARD_TITLE,
      groups: groupsOf(record),
      picked: record.answers,
      confirmText: CONFIRM_TEXT,
      cancelText: CANCEL_TEXT,
    });
  }

  /**
   * 交完卷之后那张卡：哪一题答了什么、哪一题按跳过交的，按钮摘掉。
   *
   * @param record 在册的记录
   * @returns 卡片对象
   */
  function doneCardOf(record) {
    const lines = record.questions.map((question) =>
      QUESTION_DONE_LINE(question.question, record.answers.get(question.id) ?? QUESTION_SKIPPED_LABEL));
    return buildHeaderTextCard({ title: QUESTION_DONE_TITLE, color: 'blue', content: lines.join('\n') });
  }

  /**
   * 这一轮结束了那张卡。
   *
   * @returns 卡片对象
   */
  function closedCardOf() {
    return buildHeaderTextCard({ title: QUESTION_CLOSED_TITLE, color: 'blue', content: QUESTION_ABORTED_TEXT });
  }

  /**
   * 这批题飞书答不了，回一句让人去网页端。
   *
   * @param userId 绑定的那个人
   */
  async function notifyUnsupported(userId) {
    await push.sendCard({ openId: userId }, buildTextCard(QUESTION_UNSUPPORTED_TEXT));
  }

  /**
   * 接不接这次提问：接了就把在册记录和要发的卡一起给出来。
   *
   * @param deps.request 宿主给的请求（`{ questions, agent, signal }`）
   * @param deps.requestId 这次请求的身份
   * @param deps.userId 绑定的那个人
   * @returns `{ record, card }`；不接时 undefined（先回一句「这题飞书答不了」）
   */
  async function prepare({ request, requestId, userId }) {
    if (!answerable(request?.questions)) {
      logger.info('反问：这批题飞书答不了（有题没选项、或者有题是多选），让给网页端');
      await notifyUnsupported(userId);
      return undefined;
    }
    const record = { requestId, cardId: '', questions: request.questions, answers: new Map(), settle: undefined };
    const card = cardOf(record);
    if (cardBytes(card) > CARD_MAX_BYTES) {
      logger.warn(`反问：这张卡装不下（${cardBytes(card)} 字节），让给网页端`);
      await notifyUnsupported(userId);
      return undefined;
    }
    return { record, card };
  }

  /**
   * 把这次提问作废：错误带上原因（`ASK_ABORTED` / `ASK_CANCELLED`）。
   *
   * @param record 在册的记录
   * @param code 作废原因
   * @param message 卡片上写的话，也是错误的消息
   * @param errorName 错误的 `name`；不需要时传 undefined
   */
  function rejectWith(record, code, message, errorName) {
    const error = new Error(message);
    error.code = code;
    if (errorName) error.name = errorName;
    record.settle.reject(error);
  }

  /**
   * 卡片上的点击：点选项行只选中，点「确定」才交卷，点「取消」作废。
   *
   * @param record 在册的记录
   * @param cuiEvent CUI 事件（卡片按钮的值在 `content.value` 里）
   * @returns 换卡响应
   */
  async function handleAction(record, cuiEvent) {
    const { requestId, btn, group: question, value: option } = cuiEvent?.content?.value ?? {};

    if (btn === OPTION_CARD_PICK) {
      const known = record.questions.some((item) =>
        item.id === question && (item.options ?? []).some((candidate) => candidate.label === option));
      if (!known) return cardResponse(cardOf(record));
      record.answers.set(question, option);
      logger.info(`反问卡片：${requestId} 第 ${record.answers.size}/${record.questions.length} 题选了【${option}】`);
      return cardResponse(cardOf(record));
    }

    if (btn === CARD_BUTTON_CONFIRM) {
      flow.drop(requestId);
      const answers = record.questions.map((item) => {
        const picked = record.answers.get(item.id);
        return picked === undefined ? { id: item.id, selected: [] } : { id: item.id, selected: [picked] };
      });
      logger.info(`反问卡片：${requestId} 交卷：答了 ${record.answers.size}/${record.questions.length} 题，其余按跳过`);
      record.settle.resolve({ answers });
      return cardResponse(doneCardOf(record));
    }

    if (btn === CARD_BUTTON_CANCEL) {
      if (!flow.drop(requestId)) return cardResponse(cardOf(record));
      logger.info(`反问卡片：${requestId} 被人取消`);
      rejectWith(record, ASK_CANCELLED, QUESTION_CANCELLED_TEXT, USER_QUESTION_ERROR_NAME);
      return cardResponse(buildHeaderTextCard({
        title: QUESTION_CANCELLED_TITLE,
        color: 'blue',
        content: QUESTION_CANCELLED_TEXT,
      }));
    }

    logger.info(`反问卡片：${requestId} 上认不出的按钮 ${btn || '(没有 btn)'}`);
    return undefined;
  }

  const flow = createWaterfallFlow({
    logger,
    push,
    kind: 'question',
    name: '反问',
    staleText: QUESTION_STALE_TEXT,
    describe: (record) => `${record.questions.length} 题`,
    prepare,
    abort: (record) => rejectWith(record, ASK_ABORTED, QUESTION_ABORTED_TEXT),
    closedCardOf,
    handleAction,
  });

  return { onRequest: flow.onRequest, onCardAction: flow.onCardAction };
}
