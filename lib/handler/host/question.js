/**
 * 反问卡片：agent 调 `ask_user_question` 时，把题目接到飞书来答。
 */

import { hasRunningTurn } from '../../cache/running-turn.js';
import { nextRequestId } from '../../cache/request-id.js';
import { readSettings } from '../../infra/plugin/config.js';
import {
  QUESTION_ABORTED_TEXT,
  QUESTION_CANCELLED_TEXT,
  QUESTION_CANCELLED_TITLE,
  QUESTION_CANCEL_TEXT,
  QUESTION_CARD_TITLE,
  QUESTION_CLOSED_TITLE,
  QUESTION_CONFIRM_TEXT,
  QUESTION_DONE_LINE,
  QUESTION_DONE_TITLE,
  QUESTION_FALLBACK_HEADER,
  QUESTION_INCOMPLETE_TEXT,
  QUESTION_PROGRESS_TEXT,
  QUESTION_STALE_TEXT,
  QUESTION_UNSUPPORTED_TEXT,
} from '../../copy.js';
import { CARD_BUTTON_CANCEL, CARD_BUTTON_CONFIRM, CARD_MAX_BYTES, cardBytes, cardResponse } from '../../ui/card.js';
import { OPTION_CARD_PICK, buildOptionCard } from '../../ui/option-card.js';
import { buildHeaderTextCard, buildTextCard } from '../../ui/text-card.js';

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
  /** 在册的提问：`requestId` → `{ requestId, cardId, questions, answers, settle }`。 */
  const pending = new Map();

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
   * 照记录画一张反问卡；`notice` 是顶上那行状态（进度，或者「还有 N 题没选」）。
   *
   * @param record 在册的记录
   * @param notice 顶上那行状态
   * @returns 卡片对象
   */
  function cardOf(record, notice) {
    return buildOptionCard({
      tag: QUESTION_CARD_KEY,
      requestId: record.requestId,
      title: QUESTION_CARD_TITLE,
      notice,
      groups: groupsOf(record),
      picked: record.answers,
      confirmText: QUESTION_CONFIRM_TEXT,
      cancelText: QUESTION_CANCEL_TEXT,
    });
  }

  /**
   * 顶上那行平时写的进度：已选几题、一共几题。
   *
   * @param record 在册的记录
   * @returns 进度那句话
   */
  function progressText(record) {
    return QUESTION_PROGRESS_TEXT(record.answers.size, record.questions.length);
  }

  /**
   * 交完卷之后那张卡：哪一题答了什么，按钮摘掉。
   *
   * @param record 在册的记录
   * @returns 卡片对象
   */
  function doneCardOf(record) {
    const lines = record.questions.map((question) =>
      QUESTION_DONE_LINE(question.question, record.answers.get(question.id)));
    return buildHeaderTextCard({ title: QUESTION_DONE_TITLE, color: 'blue', content: lines.join('\n') });
  }

  /**
   * 这次提问作废：记录摘掉，把等着的 Promise 拒掉。
   *
   * @param record 在册的记录
   * @param code 作废原因（`ASK_ABORTED` / `ASK_CANCELLED`）
   * @param message 卡片上写的话，也是错误的消息
   * @param name 错误的 `name`；不需要时传 undefined
   * @returns 这次是我摘掉的时候 true
   */
  function retire(record, code, message, name) {
    if (!pending.delete(record.requestId)) return false;
    const error = new Error(message);
    error.code = code;
    if (name) error.name = name;
    record.settle.reject(error);
    return true;
  }

  /**
   * 这一轮被停掉时收尾：作废，再把卡片改成「已结束」。
   *
   * @param signal 这次提问的取消信号
   * @param record 在册的记录
   */
  function watchAbort(signal, record) {
    if (!signal) return;
    const retireAborted = async () => {
      if (!retire(record, ASK_ABORTED, QUESTION_ABORTED_TEXT)) return;
      logger.info(`反问卡片：${record.requestId} 随着这一轮结束作废`);
      await push.patchCard(record.cardId, buildHeaderTextCard({
        title: QUESTION_CLOSED_TITLE,
        color: 'blue',
        content: QUESTION_ABORTED_TEXT,
      }));
    };
    if (signal.aborted) {
      void retireAborted();
      return;
    }
    signal.addEventListener('abort', () => void retireAborted(), { once: true });
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
   * 宿主要人答一次问。
   *
   * @param request 宿主给的请求（`{ questions, agent, signal }`）
   * @param next 让给下一个回答者
   * @returns 答案；不接时是下一个回答者的结果
   */
  async function onRequest(request, next) {
    const { sessionId, userId } = readSettings();
    if (!sessionId || !userId) return next();
    if (request?.agent?.id !== sessionId) {
      logger.info(`反问：不是当前会话的提问（${request?.agent?.id || '没有 agent'}），让给网页端`);
      return next();
    }
    if (!hasRunningTurn()) {
      logger.info('反问：这一轮不是飞书这边发起来的，让给网页端');
      return next();
    }
    if (!answerable(request?.questions)) {
      logger.info('反问：这批题飞书答不了（有题没选项、或者有题是多选），让给网页端');
      await notifyUnsupported(userId);
      return next();
    }

    const requestId = nextRequestId('question');
    const record = { requestId, cardId: '', questions: request.questions, answers: new Map(), settle: undefined };
    const card = cardOf(record, progressText(record));
    if (cardBytes(card) > CARD_MAX_BYTES) {
      logger.warn(`反问：这张卡装不下（${cardBytes(card)} 字节），让给网页端`);
      await notifyUnsupported(userId);
      return next();
    }

    const answer = new Promise((resolve, reject) => {
      record.settle = { resolve, reject };
    });
    pending.set(requestId, record);
    watchAbort(request.signal, record);

    const cardId = await push.sendCard({ openId: userId }, card);
    if (!cardId) {
      pending.delete(requestId);
      logger.warn('反问：卡片没发出去，让给网页端');
      return next();
    }
    record.cardId = cardId;
    if (!pending.has(requestId)) {
      logger.info(`反问卡片：${requestId} 发出前这一轮就结束了，补一刀作废`);
      await push.patchCard(cardId, buildHeaderTextCard({
        title: QUESTION_CLOSED_TITLE,
        color: 'blue',
        content: QUESTION_ABORTED_TEXT,
      }));
      return answer;
    }
    logger.info(`反问卡片已发出：${requestId}（${record.questions.length} 题，cardId=${cardId}）`);
    return answer;
  }

  /**
   * 卡片上的点击：点选项行只选中，点「确定」才交卷，点「取消」作废。
   *
   * @param cuiEvent CUI 事件（卡片按钮的值在 `content.value` 里）
   * @returns 换卡响应
   */
  async function onCardAction(cuiEvent) {
    const { requestId, btn, group: question, value: option } = cuiEvent?.content?.value ?? {};
    const record = pending.get(requestId);
    if (!record) {
      logger.info(`反问卡片：${requestId || '(没有 requestId)'} 不在册上`);
      return cardResponse(buildTextCard(QUESTION_STALE_TEXT));
    }

    if (btn === OPTION_CARD_PICK) {
      const known = record.questions.some((item) =>
        item.id === question && (item.options ?? []).some((candidate) => candidate.label === option));
      if (!known) return cardResponse(cardOf(record, progressText(record)));
      record.answers.set(question, option);
      logger.info(`反问卡片：${requestId} 第 ${record.answers.size}/${record.questions.length} 题选了【${option}】`);
      return cardResponse(cardOf(record, progressText(record)));
    }

    if (btn === CARD_BUTTON_CONFIRM) {
      const missing = record.questions.filter((item) => !record.answers.has(item.id));
      if (missing.length > 0) {
        return cardResponse(cardOf(record, QUESTION_INCOMPLETE_TEXT(missing.length)));
      }
      pending.delete(requestId);
      const answers = record.questions.map((item) => ({ id: item.id, selected: [record.answers.get(item.id)] }));
      logger.info(`反问卡片：${requestId} 答完 ${answers.length} 题`);
      record.settle.resolve({ answers });
      return cardResponse(doneCardOf(record));
    }

    if (btn === CARD_BUTTON_CANCEL) {
      if (!retire(record, ASK_CANCELLED, QUESTION_CANCELLED_TEXT, USER_QUESTION_ERROR_NAME)) {
        return cardResponse(cardOf(record, progressText(record)));
      }
      logger.info(`反问卡片：${requestId} 被人取消`);
      return cardResponse(buildHeaderTextCard({
        title: QUESTION_CANCELLED_TITLE,
        color: 'blue',
        content: QUESTION_CANCELLED_TEXT,
      }));
    }

    logger.info(`反问卡片：${requestId} 上认不出的按钮 ${btn || '(没有 btn)'}`);
    return undefined;
  }

  return { onRequest, onCardAction };
}
