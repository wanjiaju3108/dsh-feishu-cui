/** 宿主事件：把 transport 递进来的会话事件与 agent 事件转成我们自己的形状，判一次准入，把结果和事件一起交给下游。 */

import { WATCHED_SESSION_EVENTS } from '../../handler/host/settings-watch.js';

/**
 * 把一步的助手正文拼出来（只要可见文本，思考与工具调用那些块不要）。
 *
 * @param message 助手消息
 * @returns 正文
 */
function textOfMessage(message) {
  const blocks = Array.isArray(message?.content) ? message.content : [];
  return blocks
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

/**
 * 把人提交的消息里的请求身份读出来（我们铸的那个 `requestId`）。
 *
 * @param source 消息的 `source`
 * @returns 请求身份；不是人提交的、或者没带时为空串
 */
function rpcIdOf(source) {
  return source?.kind === 'user' && typeof source.rpcId === 'string' ? source.rpcId : '';
}

/**
 * 一条会话事件带的那点东西：`assistant/message` 是这一步的助手正文，`turn/end` 是这一轮怎么结束的。
 *
 * @param event 宿主会话事件
 * @returns 正文 / 结束原因；没有时为空串
 */
function contentOf(event) {
  if (event?.type === 'assistant/message') return textOfMessage(event.data?.message);
  if (event?.type === 'turn/end') return event.data?.reason?.kind ?? '';
  return '';
}

/**
 * 把一条会话事件压成内部事件。
 *
 * @param session 事件所属的会话
 * @param event 宿主会话事件
 * @returns `{ event, tag, sessionId, rpcId, turn, content, settings, hostMessageId }`
 */
function fromSessionEvent(session, event) {
  const data = event?.data;
  return {
    event: 'session',
    tag: event?.type ?? '',
    sessionId: session?.id ?? '',
    rpcId: rpcIdOf(data?.source),
    turn: data?.turn ?? 0,
    content: contentOf(event),
    settings: WATCHED_SESSION_EVENTS.includes(event?.type) ? { ...data } : undefined,
    hostMessageId: '',
  };
}

/**
 * 把一条 agent 事件压成内部事件。
 *
 * @param tag 事件名去掉 `agent/` 之后剩下的那段
 * @param payload 宿主载荷
 * @returns `{ event, tag, sessionId, rpcId, turn, content, settings, hostMessageId }`
 */
function fromAgentEvent(tag, payload) {
  return {
    event: 'agent',
    tag,
    sessionId: payload?.agent?.session?.id ?? '',
    rpcId: rpcIdOf(payload?.message?.source),
    turn: payload?.turn ?? 0,
    content: '',
    settings: undefined,
    hostMessageId: payload?.message?.id ?? '',
  };
}

/**
 * 建宿主事件接收器。
 *
 * @param deps.logger 日志
 * @param deps.admission 准入判定（`driving/host/admission.js` 的 `createAdmission`）
 * @param deps.onVerdict 判定和事件往哪送：`(code, internalEvent) => any`
 * @returns handle / handleAgent
 */
export function createReceiver({ logger, admission, onVerdict }) {
  /**
   * 转一下、判一下，通过的交给下游。
   *
   * @param internal 内部事件
   * @returns 下游的返回值
   */
  async function pass(internal) {
    const verdict = admission.admit(internal);
    if (verdict.code !== 0) {
      logger.info(`宿主事件丢弃：${verdict.reason}`);
      return undefined;
    }
    return await onVerdict(verdict.code, internal);
  }

  /**
   * 收一条会话事件。
   *
   * @param session 事件所属的会话
   * @param event 宿主会话事件
   * @returns 下游的返回值
   */
  async function handle(session, event) {
    return await pass(fromSessionEvent(session, event));
  }

  /**
   * 收一条 agent 事件。
   *
   * @param tag 事件名去掉 `agent/` 之后剩下的那段
   * @param payload 宿主载荷
   * @returns 下游的返回值
   */
  async function handleAgent(tag, payload) {
    return await pass(fromAgentEvent(tag, payload));
  }

  return { handle, handleAgent };
}
