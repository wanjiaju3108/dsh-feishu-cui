/** 私聊消息：把一条私聊消息交给当前会话。 */

import { MESSAGE_PROMPT_FAILED_TEXT, MESSAGE_SESSION_GONE_TEXT } from '../../common/copy.js';
import { readSettings } from '../../infra/plugin/config.js';
import { buildTextCard } from '../../ui/text-card.js';

/** 宿主说这个会话不在了时给的那个码（`RemoteError` 的 `code`）。 */
const SESSION_NOT_FOUND_CODE = 'session/not-found';

/**
 * 投喂失败时回哪句话：宿主明说是会话没了就说清楚，其余照旧回那句笼统的。
 *
 * @param result `catalog.prompt` 的返回值 `{ ok: false, error, code }`
 * @returns 回给发消息那个人的话
 */
function copyOfPromptFailure(result) {
  return result?.code === SESSION_NOT_FOUND_CODE ? MESSAGE_SESSION_GONE_TEXT : MESSAGE_PROMPT_FAILED_TEXT;
}

/**
 * 建消息处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.catalog 会话目录（`infra/host/session.js` 的 `createSessionCatalog`）
 * @returns prompt
 */
export function createMessageHandler({ logger, push, catalog }) {
  /**
   * 把一条私聊消息交给当前会话；交不进去就回一句话。
   *
   * @param cuiEvent CUI 事件（正文在 `content`，飞书消息 id 在 `messageId`，发消息的人在 `operatorId`）
   */
  async function prompt(cuiEvent) {
    const openId = cuiEvent?.operatorId ?? '';
    const { sessionId } = readSettings();
    const result = await catalog.prompt({
      sessionId,
      requestId: cuiEvent?.messageId ?? '',
      mode: 'queue',
      content: cuiEvent?.content ?? '',
    });
    if (!result.ok) {
      await push.sendCard({ openId }, buildTextCard(copyOfPromptFailure(result)));
      return;
    }
    logger.info(`已把消息交给会话 ${sessionId}`);
  }

  return { prompt };
}
