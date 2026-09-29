/**
 * 出站：向飞书发卡片、整张换掉已经发出去的卡片。
 */

import { createRequester } from './request.js';

/** 卡片消息的类型值。 */
const INTERACTIVE_MESSAGE_TYPE = 'interactive';

/**
 * 建出站句柄。
 *
 * @param deps.logger 日志
 * @param deps.client 取当前 REST 客户端（`transport.rest()`）；没凭据时返回 undefined
 * @returns sendCard / patchCard 两个出站方法
 */
export function createPush({ logger, client }) {
  /** 重试与成功判定走公共实现。 */
  const { call } = createRequester({ logger, client, describeMissing: '凭据未配置，消息无法发到飞书' });

  /**
   * 发一条消息到目标：有消息 ID 就回复它，否则主动私聊那个人。
   *
   * @param target `{ messageId }` 或 `{ openId }`
   * @param message 载荷
   * @param describe 日志描述
   * @param onFailure 失败原因回执
   * @returns 消息 ID；没发出去时 undefined
   */
  async function send(target, message, describe, onFailure) {
    if (!target?.messageId && !target?.openId) {
      logger.warn(`${describe}没有目标，放弃`);
      onFailure?.({ message: `${describe}没有目标` });
      return undefined;
    }
    const data = { msg_type: message.msgType, content: message.content };
    const sent = target?.messageId
      ? await call((live) => live.im.message.reply({ path: { message_id: target.messageId }, data }), describe, onFailure)
      : await call((live) => live.im.message.create({
        params: { receive_id_type: 'open_id' },
        data: { receive_id: target?.openId, ...data },
      }), describe, onFailure);
    return sent?.data?.message_id;
  }

  /**
   * 发一张卡片。
   *
   * @param target `{ messageId }` 或 `{ openId }`
   * @param card 卡片对象
   * @param onFailure 失败原因回执
   * @returns 消息 ID；没发出去时 undefined
   */
  function sendCard(target, card, onFailure) {
    return send(target, { msgType: INTERACTIVE_MESSAGE_TYPE, content: JSON.stringify(card) }, '发送卡片', onFailure);
  }

  /**
   * 整张替换已发出的卡片。
   *
   * @param messageId 卡片所在消息 ID
   * @param card 新卡片
   * @param onFailure 失败原因回执
   * @returns 更新成功时 true
   */
  async function patchCard(messageId, card, onFailure) {
    if (!messageId) {
      onFailure?.({ message: '这条记账里没有 cardId' });
      return false;
    }
    const updated = await call(
      (live) => live.im.message.patch({
        path: { message_id: messageId },
        data: { content: JSON.stringify(card) },
      }),
      '更新卡片',
      onFailure,
    );
    return updated !== undefined;
  }

  return { sendCard, patchCard };
}
