/**
 * 回答卡片：一条飞书消息一张卡，标题从「排队中」到「处理中」到终态，正文一步一步往上加；还在跑的时候卡片上带一个「停止」按钮，点了就中止这一轮。
 */

import {
  clearAnswerCard,
  readAnswerCard,
  writeAnswerCard,
} from '../../cache/pending-cards.js';
import { clearRunningTurn, readRunningTurn, setRunningTurn } from '../../cache/running-turn.js';
import { hasHandled } from '../../cache/handled-messages.js';
import {
  ANSWER_CANCELLED_TITLE,
  ANSWER_DONE_TITLE,
  ANSWER_EMPTY_TEXT,
  ANSWER_FAILED_TITLE,
  ANSWER_QUEUED_TITLE,
  ANSWER_RUNNING_TITLE,
  ANSWER_STOPPED_TITLE,
  ANSWER_STOPPING_TITLE,
  ANSWER_STOP_BUTTON_TEXT,
  ANSWER_STOP_STALE_TEXT,
  ANSWER_SEND_FAILED_TEXT,
  ANSWER_SEND_FAILED_TITLE,
  ANSWER_TOO_LONG_TEXT,
  ANSWER_TOO_LONG_TITLE,
  ANSWER_WITHDRAW_BUTTON_TEXT,
} from '../../common/copy.js';
import { readSettings } from '../../infra/plugin/config.js';
import {
  ANSWER_CARD_BTN_STOP,
  ANSWER_CARD_BTN_WITHDRAW,
  buildAnswerCard,
} from '../../ui/answer-card.js';
import { CARD_MAX_BYTES, cardBytes, cardResponse } from '../../ui/card.js';
import { buildHeaderTextCard, buildTextCard } from '../../ui/text-card.js';

/** 开卡前等多久（毫秒）再按「排队中」开卡。 */
const QUEUE_SETTLE_MS = 100;

/**
 * 建回答卡片处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.catalog 会话目录（`infra/host/session.js` 的 `createSessionCatalog`）
 * @returns onSession / onAgent / onCardAction 三个处理函数
 */
export function createAnswer({ logger, push, catalog }) {
  /** 等窗口的定时器：飞书消息 ID → timer。 */
  const waiting = new Map();

  /** 标题栏颜色：状态标题 → 飞书卡片标题栏颜色。 */
  const COLOR_OF_TITLE = {
    [ANSWER_QUEUED_TITLE]: 'wathet',
    [ANSWER_RUNNING_TITLE]: 'blue',
    [ANSWER_STOPPING_TITLE]: 'grey',
    [ANSWER_DONE_TITLE]: 'green',
    [ANSWER_CANCELLED_TITLE]: 'grey',
    [ANSWER_STOPPED_TITLE]: 'orange',
    [ANSWER_FAILED_TITLE]: 'red',
    [ANSWER_SEND_FAILED_TITLE]: 'red',
    [ANSWER_TOO_LONG_TITLE]: 'red',
  };

  /**
   * 取标题栏颜色。
   *
   * @param title 状态标题
   * @returns 颜色；标题没登记过时给灰
   */
  function colorOf(title) {
    return COLOR_OF_TITLE[title] ?? 'grey';
  }

  /**
   * 这张卡该挂哪个按钮：在跑挂「停止」，排队中挂「撤回」，其余不挂。
   *
   * @param requestId 飞书消息 ID
   * @param title 这张卡当前的标题
   * @returns `{ btn, text, requestId }`；不挂时 undefined
   */
  function actionOf(requestId, title) {
    if (title === ANSWER_RUNNING_TITLE) {
      return { btn: ANSWER_CARD_BTN_STOP, text: ANSWER_STOP_BUTTON_TEXT, requestId };
    }
    if (title === ANSWER_QUEUED_TITLE) {
      return { btn: ANSWER_CARD_BTN_WITHDRAW, text: ANSWER_WITHDRAW_BUTTON_TEXT, requestId };
    }
    return undefined;
  }

  /**
   * 照状态画一张卡：不带按钮的状态走 `ui/text-card.js` 的 `buildHeaderTextCard`，带按钮的走 `ui/answer-card.js` 的 `buildAnswerCard`。
   *
   * @param requestId 飞书消息 ID
   * @param state `{ title, content }`
   * @returns 卡片对象
   */
  function cardOf(requestId, state) {
    const action = actionOf(requestId, state.title);
    if (action === undefined) {
      return buildHeaderTextCard({ title: state.title, color: colorOf(state.title), content: state.content });
    }
    return buildAnswerCard({
      title: state.title,
      color: colorOf(state.title),
      content: state.content,
      action,
    });
  }

  /** 每张卡一条队列：飞书消息 ID → 上一笔还没干完的活。 */
  const painting = new Map();

  /**
   * 把一件活排进这张卡的队列：同一张卡的改动按顺序来。
   *
   * @param requestId 飞书消息 ID
   * @param job 要在队列里干的事
   * @returns 这一笔的 promise
   */
  function queue(requestId, job) {
    const previous = painting.get(requestId) ?? Promise.resolve();
    const next = previous.then(job).catch((error) => {
      logger.warn(`回答卡片操作失败（${requestId}）：${error?.message ?? error}`);
    });
    painting.set(requestId, next);
    return next;
  }

  /**
   * 队列里的一步：按当时账上的记录算出新标题与正文，先改账再发请求。
   *
   * 两种画不上去的情况都会把卡片换成提示卡并记账，不再往下画：正文超过 `CARD_MAX_BYTES` 记 `tooLong`；
   * **调飞书发失败**（不管什么原因，缺凭据、网络、飞书拒收都一样）记 `sendFailed`——那时正文一个字都没上屏，
   * 只能让人去网页端看。
   *
   * @param requestId 飞书消息 ID
   * @param compute `(record) => ({ title, content })`；返回 undefined 表示这次不用画
   */
  async function paint(requestId, compute) {
    const record = readAnswerCard(requestId);
    if (!record) {
      logger.info(`画回答卡片：${requestId} 不在账上，跳过`);
      return;
    }
    if (record.tooLong || record.sendFailed) return;
    const next = compute(record);
    if (next === undefined) return;

    const card = cardOf(requestId, next);
    if (cardBytes(card) > CARD_MAX_BYTES) {
      logger.warn(`回答卡片装不下（${requestId}，正文 ${next.content.length} 字），改成提示卡`);
      writeAnswerCard(requestId, {
        ...record,
        tooLong: true,
        title: ANSWER_TOO_LONG_TITLE,
        content: ANSWER_TOO_LONG_TEXT,
      });
      await push.patchCard(record.cardId, buildHeaderTextCard({
        title: ANSWER_TOO_LONG_TITLE,
        color: colorOf(ANSWER_TOO_LONG_TITLE),
        content: ANSWER_TOO_LONG_TEXT,
      }));
      return;
    }

    writeAnswerCard(requestId, { ...record, title: next.title, content: next.content });
    /** @type {{ code?: number, message?: string } | undefined} */
    let failure;
    const updated = await push.patchCard(record.cardId, card, (info) => {
      failure = info;
    });
    if (!updated) {
      logger.warn(
        `回答卡片没发到飞书（${requestId}）：code=${failure?.code} msg=${failure?.message}`,
      );
      writeAnswerCard(requestId, {
        ...record,
        sendFailed: true,
        title: ANSWER_SEND_FAILED_TITLE,
        content: ANSWER_SEND_FAILED_TEXT,
      });
      await push.patchCard(record.cardId, buildHeaderTextCard({
        title: ANSWER_SEND_FAILED_TITLE,
        color: colorOf(ANSWER_SEND_FAILED_TITLE),
        content: ANSWER_SEND_FAILED_TEXT,
      }));
      return;
    }
    logger.info(`画回答卡片（${requestId}，cardId=${record.cardId || '(空)'}，${next.title}，${next.content.length} 字）→ ${updated}`);
  }

  /**
   * 这条飞书消息是不是我们交给会话的那条。
   *
   * @param requestId 飞书消息 ID
   * @returns 是的话 true
   */
  function isOurs(requestId) {
    return Boolean(requestId) && hasHandled(requestId);
  }

  /**
   * 开一张卡：回复到那条飞书消息上，先把标题摆对、正文空着。
   *
   * @param requestId 飞书消息 ID
   * @param deps.running 是否已经被某一轮取走
   * @param deps.turn 取走它的 turn 号；还没取走时给 0
   * @param deps.hostMessageId 宿主那条 user message 的 id
   */
  async function open(requestId, { running, turn, hostMessageId }) {
    const title = running ? ANSWER_RUNNING_TITLE : ANSWER_QUEUED_TITLE;
    writeAnswerCard(requestId, { cardId: '', title, content: '', hostMessageId: hostMessageId ?? '' });
    if (turn) setRunningTurn(turn, requestId);
    const cardId = await push.sendCard({
      messageId: requestId,
    }, cardOf(requestId, { title, content: '' }));
    if (!cardId) {
      logger.warn(`回答卡片没发出去（${requestId}）`);
      clearAnswerCard(requestId);
      return;
    }
    logger.info(`回答卡片已开出（${requestId}，${title}，cardId=${cardId}）`);
    await queue(requestId, async () => {
      const record = readAnswerCard(requestId);
      if (!record) {
        await push.patchCard(cardId, cardOf(requestId, { title: ANSWER_CANCELLED_TITLE, content: '' }));
        return;
      }
      writeAnswerCard(requestId, { ...record, cardId });
      await paint(requestId, (live) => ({ title: live.title, content: live.content }));
    });
  }

  /**
   * 清掉等窗口的定时器。
   *
   * @param requestId 飞书消息 ID
   */
  function settle(requestId) {
    const timer = waiting.get(requestId);
    if (timer === undefined) return;
    clearTimeout(timer);
    waiting.delete(requestId);
  }

  /**
   * 队列里多了一条：等一个窗口再开「排队中」的卡。
   *
   * @param internal 内部事件
   */
  async function onInserted(internal) {
    if (!isOurs(internal.rpcId) || readAnswerCard(internal.rpcId)) return;
    settle(internal.rpcId);
    const timer = setTimeout(() => {
      waiting.delete(internal.rpcId);
      void open(internal.rpcId, { running: false, turn: 0, hostMessageId: internal.hostMessageId });
    }, QUEUE_SETTLE_MS);
    waiting.set(internal.rpcId, timer);
  }

  /**
   * 被某一轮取走了：还没开卡就直接开「处理中」，已经开着的把标题改成「处理中」，并把这一轮对应的飞书消息记进 `running-turn`。
   *
   * @param internal 内部事件
   */
  async function onClaimed(internal) {
    if (!isOurs(internal.rpcId)) return;
    settle(internal.rpcId);
    const record = readAnswerCard(internal.rpcId);
    if (!record) {
      await open(internal.rpcId, { running: true, turn: internal.turn, hostMessageId: internal.hostMessageId });
      return;
    }
    if (internal.hostMessageId && !record.hostMessageId) {
      writeAnswerCard(internal.rpcId, { ...record, hostMessageId: internal.hostMessageId });
    }
    if (internal.turn) setRunningTurn(internal.turn, internal.rpcId);
    await queue(internal.rpcId, () => paint(internal.rpcId, (live) => (
      live.title === ANSWER_QUEUED_TITLE ? { title: ANSWER_RUNNING_TITLE, content: live.content } : undefined
    )));
  }

  /**
   * 排队里这条被撤了：卡片换成「对话已取消」；还没开卡就不开。
   *
   * @param internal 内部事件
   */
  async function onDiscarded(internal) {
    if (!isOurs(internal.rpcId)) return;
    settle(internal.rpcId);
    if (!readAnswerCard(internal.rpcId)) return;
    await queue(internal.rpcId, async () => {
      await paint(internal.rpcId, (live) => ({ title: ANSWER_CANCELLED_TITLE, content: live.content }));
      clearAnswerCard(internal.rpcId);
      painting.delete(internal.rpcId);
    });
  }

  /**
   * 这一轮结束时的标题，按宿主给的结束原因分。
   *
   * @param reason 结束原因（`turn/end` 的 `reason.kind`）
   * @returns 状态标题
   */
  function titleOfEnd(reason) {
    if (reason === 'aborted') return ANSWER_STOPPED_TITLE;
    if (reason === 'error') return ANSWER_FAILED_TITLE;
    return ANSWER_DONE_TITLE;
  }

  /**
   * 会话事件：正文往上加、一轮结束收尾。
   *
   * @param internal 内部事件
   */
  async function onSession(internal) {
    const requestId = readRunningTurn(internal.turn);
    if (!readAnswerCard(requestId)) return;

    if (internal.tag === 'assistant/message') {
      if (!internal.content) return;
      await queue(requestId, () => paint(requestId, (live) => (
        { title: live.title, content: `${live.content}${internal.content}` }
      )));
      return;
    }
    if (internal.tag === 'turn/end') {
      await queue(requestId, async () => {
        await paint(requestId, (live) => ({
          title: titleOfEnd(internal.content),
          content: live.content || ANSWER_EMPTY_TEXT,
        }));
        clearAnswerCard(requestId);
        painting.delete(requestId);
        clearRunningTurn(internal.turn);
      });
    }
  }

  /**
   * 卡片上的按钮：在跑的挂「停止」，排队中的挂「撤回」，按 `btn` 分给下面两个函数。
   *
   * @param cuiEvent CUI 事件（卡片按钮的值在 `content.value` 里）
   * @returns 换卡响应
   */
  async function onCardAction(cuiEvent) {
    const requestId = cuiEvent?.content?.value?.requestId ?? '';
    const btn = cuiEvent?.content?.value?.btn ?? '';
    const record = readAnswerCard(requestId);
    if (record === undefined) {
      logger.info(`这张回答卡已经不在账上了（${requestId || '(无 requestId)'}）`);
      return cardResponse(buildTextCard(ANSWER_STOP_STALE_TEXT));
    }
    if (btn === ANSWER_CARD_BTN_WITHDRAW) return await withdraw(requestId, record);
    return await stop(requestId, record);
  }

  /**
   * 「撤回」：把排队里还没跑的那条从队列里撤掉。
   *
   * @param requestId 飞书消息 ID
   * @param record 账上的记录
   * @returns 换卡响应
   */
  async function withdraw(requestId, record) {
    if (record.title !== ANSWER_QUEUED_TITLE) {
      logger.info(`撤回按钮已经没用了（${requestId}）：这一轮是「${record.title}」，不在排队`);
      return cardResponse(cardOf(requestId, record));
    }
    const keep = cardOf(requestId, record);
    if (!record.hostMessageId) {
      logger.warn(`撤回不了（${requestId}）：账里没有宿主那条消息的 id`);
      return cardResponse(keep);
    }

    const { sessionId } = readSettings();
    const result = await catalog.removeQueued({ sessionId, itemId: record.hostMessageId });
    if (!result.ok) {
      logger.warn(`撤回失败（会话 ${sessionId}）：${result.error}`);
      return cardResponse(keep);
    }
    logger.info(`已把排队的这条从会话 ${sessionId} 的队列里撤掉（${requestId}）`);
    await queue(requestId, async () => {
      await paint(requestId, (live) => ({ title: ANSWER_CANCELLED_TITLE, content: live.content }));
      clearAnswerCard(requestId);
      painting.delete(requestId);
    });
    return cardResponse(cardOf(requestId, { title: ANSWER_CANCELLED_TITLE, content: record.content }));
  }

  /**
   * 「停止」：中止会话当前这一轮。
   *
   * @param requestId 飞书消息 ID
   * @param record 账上的记录
   * @returns 换卡响应
   */
  async function stop(requestId, record) {
    if (record.title !== ANSWER_RUNNING_TITLE) {
      logger.info(`停止按钮已经没用了（${requestId}）：这一轮是「${record.title}」，不在跑`);
      return cardResponse(cardOf(requestId, record));
    }

    const { sessionId } = readSettings();
    const result = await catalog.cancel({ sessionId });
    if (!result.ok) {
      logger.warn(`停止失败（会话 ${sessionId}）：${result.error}`);
      return cardResponse(cardOf(requestId, record));
    }
    logger.info(`收到飞书侧的停止请求，已请求中止会话 ${sessionId} 当前这一轮`);
    await queue(requestId, async () => {
      await paint(requestId, (live) => ({ title: ANSWER_STOPPING_TITLE, content: live.content }));
    });
    const live = readAnswerCard(requestId) ?? record;
    return cardResponse(cardOf(requestId, live));
  }

  /**
   * agent 事件：按 tag 分。
   *
   * @param internal 内部事件
   */
  async function onAgent(internal) {
    if (internal.tag === 'inbox/inserted') return await onInserted(internal);
    if (internal.tag === 'inbox/claimed') return await onClaimed(internal);
    if (internal.tag === 'inbox/discarded') return await onDiscarded(internal);
    return undefined;
  }

  return { onSession, onAgent, onCardAction };
}
