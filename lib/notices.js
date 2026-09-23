/**
 * 给绑定的那个人发卡：连上时的通告、解绑。
 */

import {
  ANNOUNCE_NO_SESSION_TEXT,
  ANNOUNCE_SESSION_TEXT,
  UNBOUND_TEXT,
  UNBOUND_TITLE,
} from './common/copy.js';
import { clearPairingCode } from './cache/pairing.js';
import { readSettings, writeSettings } from './infra/plugin/config.js';
import { buildHeaderTextCard, buildTextCard } from './ui/text-card.js';

/**
 * 建通告件：连接状态变了、要解绑了，各给绑定的那个人发一张卡。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.catalog 会话目录（`infra/host/session.js` 的 `createSessionCatalog`）
 * @returns onStatus / unbindUser
 */
export function createNotices({ logger, push, catalog }) {
  /**
   * 连上之后给绑定的人发一张卡：告诉他连上了、当前会话是哪个。
   */
  async function announceConnected() {
    const { sessionId, userId } = readSettings();
    if (!userId) {
      logger.info('还没有绑定的会话，这张卡片没有地方发');
      return;
    }
    const title = sessionId ? await catalog.titleOf(sessionId) : '';
    const text = sessionId ? ANNOUNCE_SESSION_TEXT(title || sessionId) : ANNOUNCE_NO_SESSION_TEXT;
    try {
      await push.sendCard({ openId: userId }, buildTextCard(text));
    } catch (error) {
      logger.warn(`连接通告没发出去：${error?.message ?? error}`);
    }
  }

  /**
   * 连接状态变化：记一行日志；连上就补一次通告。
   *
   * @param status `{ connected, error }`
   */
  function onStatus(status) {
    if (status.connected) {
      logger.info('飞书长连接已建立');
      void announceConnected();
      return;
    }
    logger.warn(`飞书长连接断开：${status.error ?? '(没有错误信息)'}`);
  }

  /**
   * 解绑：把 user 清掉、在册的配对码一起作废，再给原 user 发一张告知卡片
   * （不等着发完，不影响解绑本身）。
   */
  async function unbindUser() {
    const { userId } = readSettings();
    await writeSettings({ ...readSettings(), userId: '' });
    clearPairingCode();
    logger.info('已解绑 user，在册的配对码一并作废');
    if (!userId) return;
    void push.sendCard(
      { openId: userId },
      buildHeaderTextCard({ title: UNBOUND_TITLE, content: UNBOUND_TEXT, color: 'grey' }),
    );
  }

  return { onStatus, unbindUser };
}
