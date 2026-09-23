/**
 * 出站：向飞书发卡片、整张换掉已经发出去的卡片。
 */

import { setTimeout as delay } from 'node:timers/promises';

/** 卡片消息的类型值。 */
const INTERACTIVE_MESSAGE_TYPE = 'interactive';

/** 一次发送最多试几次。 */
const SEND_MAX_ATTEMPTS = 3;

/** 重试的退避基数（毫秒），第 n 次等 `SEND_RETRY_BASE_MS * n`。 */
const SEND_RETRY_BASE_MS = 300;

/**
 * 判断飞书接口返回体是不是成功。
 *
 * @param response 飞书接口返回体
 * @returns 成功时 true
 */
function isFeishuOk(response) {
  if (response === undefined || response === null) return false;
  if (response.code === undefined) return response.data !== undefined;
  return response.code === 0;
}

/**
 * 建出站句柄。
 *
 * @param deps.logger 日志
 * @param deps.client 取当前 REST 客户端（`transport.rest()`）；没凭据时返回 undefined
 * @returns sendCard / patchCard 两个出站方法
 */
export function createPush({ logger, client }) {
  /**
   * 发一次请求：没客户端直接放弃；抛错按 `SEND_MAX_ATTEMPTS` 重试，退避随次数递增。
   *
   * @param request 拿到客户端后真正要发的请求
   * @param describe 日志里用来描述这次发送的短句
   * @returns 成功时返回响应体；放弃、没凭据或业务失败时 undefined
   */
  async function call(request, describe) {
    const live = client();
    if (!live) {
      logger.warn('凭据未配置，消息无法发到飞书');
      return undefined;
    }
    for (let attempt = 1; attempt <= SEND_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await request(live);
        if (isFeishuOk(response)) return response;
        logger.warn(`${describe}被拒：code=${response?.code} msg=${response?.msg}`);
        return undefined;
      } catch (error) {
        if (attempt === SEND_MAX_ATTEMPTS) {
          logger.warn(`${describe}失败，已放弃（尝试 ${attempt} 次）：${error?.message ?? error}`);
          return undefined;
        }
        logger.warn(`${describe}失败，准备第 ${attempt + 1} 次尝试：${error?.message ?? error}`);
        await delay(SEND_RETRY_BASE_MS * attempt);
      }
    }
    return undefined;
  }

  /**
   * 发一条消息到目标：有消息 ID 就回复它，否则主动私聊那个人。
   *
   * @param target `{ messageId }` 或 `{ openId }`
   * @param message 载荷
   * @param describe 日志描述
   * @returns 消息 ID；没发出去时 undefined
   */
  async function send(target, message, describe) {
    if (!target?.messageId && !target?.openId) {
      logger.warn(`${describe}没有目标，放弃`);
      return undefined;
    }
    const data = { msg_type: message.msgType, content: message.content };
    const sent = target?.messageId
      ? await call((live) => live.im.message.reply({ path: { message_id: target.messageId }, data }), describe)
      : await call((live) => live.im.message.create({
        params: { receive_id_type: 'open_id' },
        data: { receive_id: target?.openId, ...data },
      }), describe);
    return sent?.data?.message_id;
  }

  /**
   * 发一张卡片。
   *
   * @param target `{ messageId }` 或 `{ openId }`
   * @param card 卡片对象
   * @returns 消息 ID；没发出去时 undefined
   */
  function sendCard(target, card) {
    return send(target, { msgType: INTERACTIVE_MESSAGE_TYPE, content: JSON.stringify(card) }, '发送卡片');
  }

  /**
   * 整张替换已发出的卡片。
   *
   * @param messageId 卡片所在消息 ID
   * @param card 新卡片
   * @returns 更新成功时 true
   */
  async function patchCard(messageId, card) {
    if (!messageId) return false;
    const updated = await call(
      (live) => live.im.message.patch({
        path: { message_id: messageId },
        data: { content: JSON.stringify(card) },
      }),
      '更新卡片',
    );
    return updated !== undefined;
  }

  return { sendCard, patchCard };
}
