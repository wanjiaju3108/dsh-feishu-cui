/** 私聊消息：把文本、图片、文件交给当前会话。 */

import {
  MESSAGE_ATTACHMENT_FAILED_TEXT,
  MESSAGE_PROMPT_FAILED_TEXT,
  MESSAGE_SESSION_GONE_TEXT,
} from '../../common/copy.js';
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
 * @param deps.resources 资源下载器（`infra/feishu/resource.js` 的 `createResourceFetcher`）
 * @returns prompt
 */
export function createMessageHandler({ logger, push, catalog, resources }) {
  /**
   * 把一条私聊消息交给当前会话；交不进去就回一句话。
   *
   * 文本进 `text` 块；图片下载后转 base64 进 `image` 块；文件落到会话工作区的
   * `.dsh-uploads/`，用 `text` 块把路径告诉 agent。富文本里的文字和图片按同样规则处理。
   *
   * @param cuiEvent CUI 事件（正文在 `content`，附件在 `attachments`，消息 id 在 `messageId`）
   */
  async function prompt(cuiEvent) {
    const openId = cuiEvent?.operatorId ?? '';
    const { sessionId } = readSettings();

    /** 这一轮交给会话的内容。 */
    const parts = [];
    const text = cuiEvent?.content ?? '';
    if (text) parts.push({ type: 'text', text });

    /** 文件落盘用的会话工作区；同一条消息里的多个文件只查一次。 */
    let dir;

    for (const [index, attachment] of (cuiEvent?.attachments ?? []).entries()) {
      if (attachment?.kind === 'image') {
        const image = await resources.readImage({
          imageKey: attachment.key,
          messageId: cuiEvent?.messageId ?? '',
        });
        if (!image) {
          await push.sendCard({ openId }, buildTextCard(MESSAGE_ATTACHMENT_FAILED_TEXT));
          return;
        }
        parts.push({
          type: 'image',
          mediaType: image.mediaType,
          data: image.data,
          name: attachment.name || 'image',
        });
      } else if (attachment?.kind === 'file') {
        dir ??= await catalog.cwdOf(sessionId);
        if (!dir) {
          await push.sendCard({ openId }, buildTextCard(MESSAGE_PROMPT_FAILED_TEXT));
          return;
        }
        const saved = await resources.saveFile({
          fileKey: attachment.key,
          messageId: cuiEvent?.messageId ?? '',
          name: attachment.name,
          dir,
          prefix: `${cuiEvent?.messageId ?? 'file'}_${index}`,
        });
        if (!saved) {
          await push.sendCard({ openId }, buildTextCard(MESSAGE_ATTACHMENT_FAILED_TEXT));
          return;
        }
        parts.push({ type: 'text', text: `用户发来文件：${saved}` });
      }
    }

    const result = await catalog.prompt({
      sessionId,
      requestId: cuiEvent?.messageId ?? '',
      mode: 'queue',
      content: parts,
    });
    if (!result.ok) {
      await push.sendCard({ openId }, buildTextCard(copyOfPromptFailure(result)));
      return;
    }
    logger.info(`已把消息交给会话 ${sessionId}`);
  }

  return { prompt };
}
