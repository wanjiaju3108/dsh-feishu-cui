/** 事件路由：拿 `code` 和 CUI 事件，按事件与 `tag` 决定交给谁。 */

import { BALANCE_KEY } from '../../handler/feishu/balance.js';
import { EFFORT_KEY } from '../../handler/feishu/effort.js';
import { MODEL_KEY } from '../../handler/feishu/model.js';
import { PERMISSION_KEY } from '../../handler/feishu/permission.js';
import { PAIRING_KEY } from '../../handler/feishu/pairing.js';
import { QUESTION_CARD_KEY } from '../../handler/host/question.js';
import { SESSION_RENAME_KEY } from '../../handler/feishu/session-rename.js';
import { SESSION_LIST_KEY } from '../../handler/feishu/sessions.js';
import { WORKSPACES_KEY } from '../../handler/feishu/workspaces.js';
import { ANSWER_CARD_KEY } from '../../ui/answer-card.js';
import { APPROVAL_CARD_KEY } from '../../ui/approval-card.js';

/**
 * 建事件路由器。
 *
 * @param deps.logger 日志
 * @param deps.pairing 配对：`{ pushPairingCode(cuiEvent), verifyPairingCode(cuiEvent) }`
 * @param deps.balance 余额：`{ pushBalance(cuiEvent) }`
 * @param deps.sessions 会话列表：`{ pushSessionList(cuiEvent), handleSessionCard(cuiEvent) }`
 * @param deps.sessionRename 会话重命名：`{ pushSessionRename(cuiEvent), handleSessionRenameCard(cuiEvent) }`
 * @param deps.workspaces 工作区列表：`{ pushWorkspaceList(cuiEvent), handleWorkspaceCard(cuiEvent) }`
 * @param deps.model 模型：`{ pushModelCard(cuiEvent), handleModelCard(cuiEvent) }`
 * @param deps.effort 推理深度：`{ pushEffortCard(cuiEvent), handleEffortCard(cuiEvent) }`
 * @param deps.permission 权限：`{ pushPermissionCard(cuiEvent), handlePermissionCard(cuiEvent) }`
 * @param deps.message 私聊消息：`{ prompt(cuiEvent) }`
 * @param deps.answer 回答卡片：`{ onCardAction(cuiEvent) }`
 * @param deps.question 反问卡片：`{ onCardAction(cuiEvent) }`
 * @param deps.approval 审批卡片：`{ onCardAction(cuiEvent) }`
 * @param deps.warn 判定没通过时的收尾：`{ handle(verdict, cuiEvent) }`
 * @returns route
 */
export function createRouter({
  logger, pairing, balance, sessions, sessionRename, workspaces, model, effort, permission, message, answer,
  question, approval, warn,
}) {
  /**
   * 按判定和事件决定交给谁。
   *
   * @param verdict `admission.js` 的判定：`{ code, reason }`
   * @param cuiEvent CUI 事件
   * @returns 处理函数的返回值（卡片回调换卡靠它）；其余情况 undefined
   */
  async function route(verdict, cuiEvent) {
    if (verdict?.code !== 0) return await warn.handle(verdict, cuiEvent);

    if (cuiEvent?.event === 'message') return message.prompt(cuiEvent);

    if (cuiEvent?.event === 'menu') {
      if (cuiEvent.tag === PAIRING_KEY) return pairing.pushPairingCode(cuiEvent);
      if (cuiEvent.tag === BALANCE_KEY) return balance.pushBalance(cuiEvent);
      if (cuiEvent.tag === SESSION_LIST_KEY) return sessions.pushSessionList(cuiEvent);
      if (cuiEvent.tag === SESSION_RENAME_KEY) return sessionRename.pushSessionRename(cuiEvent);
      if (cuiEvent.tag === WORKSPACES_KEY) return workspaces.pushWorkspaceList(cuiEvent);
      if (cuiEvent.tag === MODEL_KEY) return model.pushModelCard(cuiEvent);
      if (cuiEvent.tag === EFFORT_KEY) return effort.pushEffortCard(cuiEvent);
      if (cuiEvent.tag === PERMISSION_KEY) return permission.pushPermissionCard(cuiEvent);
      logger.warn(`这个菜单项还没有去处：${cuiEvent.tag || '(无 tag)'}`);
      return undefined;
    }

    if (cuiEvent?.event === 'card') {
      if (cuiEvent.tag === PAIRING_KEY) return pairing.verifyPairingCode(cuiEvent);
      if (cuiEvent.tag === SESSION_LIST_KEY) return sessions.handleSessionCard(cuiEvent);
      if (cuiEvent.tag === SESSION_RENAME_KEY) return sessionRename.handleSessionRenameCard(cuiEvent);
      if (cuiEvent.tag === WORKSPACES_KEY) return workspaces.handleWorkspaceCard(cuiEvent);
      if (cuiEvent.tag === MODEL_KEY) return model.handleModelCard(cuiEvent);
      if (cuiEvent.tag === EFFORT_KEY) return effort.handleEffortCard(cuiEvent);
      if (cuiEvent.tag === PERMISSION_KEY) return permission.handlePermissionCard(cuiEvent);
      if (cuiEvent.tag === ANSWER_CARD_KEY) return answer.onCardAction(cuiEvent);
      if (cuiEvent.tag === QUESTION_CARD_KEY) return question.onCardAction(cuiEvent);
      if (cuiEvent.tag === APPROVAL_CARD_KEY) return approval.onCardAction(cuiEvent);
      logger.warn(`这张卡片还没有去处：${cuiEvent.tag || '(无 tag)'}`);
      return undefined;
    }

    logger.warn(`这类事件还没有去处：${cuiEvent?.event ?? '(无 event)'}`);
    return undefined;
  }

  return { route };
}
