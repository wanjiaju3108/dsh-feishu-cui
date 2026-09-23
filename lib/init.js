/**
 * 给绑定的那个人发卡：连上时的通告、解绑后的告知。
 */

import {
  ANNOUNCE_NO_SESSION_TEXT,
  ANNOUNCE_SESSION_TEXT,
  UNBOUND_TEXT,
  UNBOUND_TITLE,
} from './common/copy.js';
import { readSettings } from './infra/plugin/config.js';
import { buildHeaderTextCard, buildTextCard } from './ui/text-card.js';

/**
 * 向已经绑定的人发一张卡片。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.card 要发的卡片对象（`ui/` 里造出来的）
 * @returns 消息 ID；没绑定或没发出去时 undefined
 */
async function sendCardToBoundUser({ logger, push, card }) {
  const { userId } = readSettings();
  if (!userId) {
    logger.info('还没有绑定的会话，这张卡片没有地方发');
    return undefined;
  }
  return push.sendCard({ openId: userId }, card);
}

/**
 * 连上之后给绑定的人发一张卡：告诉他连上了、当前会话是哪个。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄
 * @param deps.sessionId 当前会话 ID；没有时为空串
 * @param deps.title 当前会话的名字
 * @returns 消息 ID；没绑定或没发出去时 undefined
 */
export async function sendConnectedNotice({ logger, push, sessionId, title }) {
  const text = sessionId ? ANNOUNCE_SESSION_TEXT(title || sessionId) : ANNOUNCE_NO_SESSION_TEXT;
  return sendCardToBoundUser({ logger, push, card: buildTextCard(text) });
}

/**
 * 解绑之后给原 user 发一张卡，告诉他这边已经解绑。
 *
 * @param deps.push 出站句柄
 * @param deps.userId 原 user 的 ID；为空时不发
 */
export function sendUnboundNotice({ push, userId }) {
  if (!userId) return;
  void push.sendCard(
    { openId: userId },
    buildHeaderTextCard({ title: UNBOUND_TITLE, content: UNBOUND_TEXT, color: 'grey' }),
  );
}
