/** 入站准入：CUI 事件进来之后的非业务检查——去重、迟到、鉴权、配对判定、只认文本，产物是一条判定（verdict）。 */

import {
  NO_CURRENT_SESSION_TEXT,
  NOT_MATCHED_TEXT,
  SESSION_SWITCH_BUSY_TEXT,
  UNSUPPORTED_MESSAGE_TEXT,
  WORKSPACE_SWITCH_BUSY_TEXT,
} from '../../copy.js';

import { PAIRING_KEY } from '../../handler/feishu/pairing.js';
import { SESSION_LIST_KEY } from '../../handler/feishu/sessions.js';
import { WORKSPACES_KEY } from '../../handler/feishu/workspaces.js';

import { hasHandled, rememberHandled } from '../../cache/handled-messages.js';
import { hasAnswerCard } from '../../cache/pending-cards.js';
import { CARD_BUTTON_CONFIRM } from '../../ui/card.js';
import { OPTION_CARD_ADD } from '../../ui/option-card.js';

/** 消息事件迟到超过这么多毫秒就直接丢弃。 */
export const STALE_MESSAGE_MS = 3000;

/**
 * 建入站准入判定器。
 *
 * @param deps.readSettings 现读三项配置：`() => { sessionId, userId, workspaceId }`
 * @returns admitMessage / admitMenu / admitCard
 */
export function createAdmission({ readSettings }) {
  /**
   * 这个操作者是不是当前 user。
   *
   * @param operatorId 操作者 ID
   * @returns 是 user 时 true
   */
  function isUser(operatorId) {
    const userId = readSettings().userId;
    return Boolean(userId) && operatorId === userId;
  }

  /**
   * 这次操作会不会换掉当前会话 / 工作区，而插件还有活没干完。
   *
   * @param tag CUI 事件的卡片类型 / 菜单项的 `event_key`
   * @returns 要回给用户的那句话；不该挡时为空串
   */
  function switchBlockedText(tag) {
    if (!hasAnswerCard()) return '';
    if (tag === SESSION_LIST_KEY) return SESSION_SWITCH_BUSY_TEXT;
    if (tag === WORKSPACES_KEY) return WORKSPACE_SWITCH_BUSY_TEXT;
    return '';
  }

  /**
   * 收到一条私聊消息。
   *
   * @param cuiEvent CUI 事件
   * @returns 判定
   */
  function admitMessage(cuiEvent) {
    const { messageId, time, content, operatorId } = cuiEvent;
    if (time !== undefined && Date.now() - time > STALE_MESSAGE_MS) {
      const lateSeconds = Math.round((Date.now() - time) / 1000);
      return { code: 1, reason: `消息迟到了 ${lateSeconds} 秒（${messageId}），丢弃` };
    }
    if (hasHandled(messageId)) {
      return { code: 1, reason: `同一条飞书消息又投递了一次（${messageId}），忽略` };
    }
    rememberHandled(messageId);

    if (!isUser(operatorId)) {
      return { code: 2, reason: NOT_MATCHED_TEXT };
    }
    if (!content) {
      return { code: 2, reason: UNSUPPORTED_MESSAGE_TEXT };
    }
    if (!readSettings().sessionId) {
      return { code: 2, reason: NO_CURRENT_SESSION_TEXT };
    }
    return { code: 0 };
  }

  /**
   * 收到一次机器人菜单点击。
   *
   * @param cuiEvent CUI 事件
   * @returns 判定
   */
  function admitMenu(cuiEvent) {
    if (cuiEvent.tag === PAIRING_KEY) return { code: 0 };
    const { userId } = readSettings();
    if (!userId || userId !== cuiEvent.operatorId) {
      return { code: 2, reason: NOT_MATCHED_TEXT };
    }
    const blocked = switchBlockedText(cuiEvent.tag);
    if (blocked) return { code: 2, reason: blocked };
    return { code: 0 };
  }

  /**
   * 收到一次卡片回调。
   *
   * @param cuiEvent CUI 事件
   * @returns 判定
   */
  function admitCard(cuiEvent) {
    const { userId } = readSettings();
    if (!userId) {
      return cuiEvent.tag === PAIRING_KEY ? { code: 0 } : { code: 2, reason: NOT_MATCHED_TEXT };
    }
    if (userId !== cuiEvent.operatorId) {
      return { code: 2, reason: NOT_MATCHED_TEXT };
    }
    const btn = cuiEvent?.content?.value?.btn;
    if (btn === CARD_BUTTON_CONFIRM || btn === OPTION_CARD_ADD) {
      const blocked = switchBlockedText(cuiEvent.tag);
      if (blocked) return { code: 2, reason: blocked };
    }
    return { code: 0 };
  }

  return { admitMessage, admitMenu, admitCard };
}
