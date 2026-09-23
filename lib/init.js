/**
 * 启动时要做的事：向已经绑定的会话发一张卡片。
 */

import { readSettings } from './infra/plugin/config.js';

/**
 * 向已经绑定的会话发一张卡片。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.card 要发的卡片对象（`ui/` 里造出来的）
 * @returns 消息 ID；没绑定或没发出去时 undefined
 */
export async function sendCardToBoundUser({ logger, push, card }) {
  const { userId } = readSettings();
  if (!userId) {
    logger.info('还没有绑定的会话，这张卡片没有地方发');
    return undefined;
  }
  return push.sendCard({ openId: userId }, card);
}
