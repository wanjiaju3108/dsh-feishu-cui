/** 会话列表：菜单里点「会话列表」时发卡，卡片上点行 / 确定 / 新建 / 取消时接着办。 */

import {
  CANCEL_TEXT,
  CONFIRM_TEXT,
  SESSION_CARD_EMPTY_TEXT,
  SESSION_CARD_SUMMARY,
  SESSION_CARD_TITLE,
  SESSION_CREATE_FAILED_ERROR,
  SESSION_GONE_ERROR,
  SESSION_LIST_CANCELLED_TEXT,
  SESSION_LIST_STALE_TEXT,
  SESSION_NEW_BUTTON_TEXT,
  SESSION_NO_WORKSPACE_TEXT,
  SESSION_SWITCHED_TEXT,
} from '../../common/copy.js';
import { readSettings, writeSettings } from '../../infra/plugin/config.js';
import { OPTION_CARD_ADD, buildOptionCardWithAdd } from '../../ui/option-card.js';
import { buildTextCard } from '../../ui/text-card.js';
import { createOptionCardFlow } from './option-card-flow.js';

/** 这个菜单项的 `event_key`，也是卡片的类型。 */
export const SESSION_LIST_KEY = 'sessions';

/**
 * 会话在选项里显示成什么。
 *
 * @param session 会话摘要
 * @returns 显示名；没有标题时退回会话 ID
 */
function labelOf(session) {
  return session.title || session.id;
}

/**
 * 建会话列表处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.catalog 会话目录（`infra/host/session.js` 的 `createSessionCatalog`）
 * @param deps.workspaces 工作区封装（`infra/host/workspace.js` 的 `createWorkspaces`）
 * @returns pushSessionList / handleSessionCard
 */
export function createSessionsHandler({ logger, push, catalog, workspaces }) {
  /**
   * 拼一张会话列表卡片；`error` 有值时写在正文最上面。
   *
   * @param deps.selected 当前勾着的会话 ID
   * @param deps.error 写回正文最上面的那句话
   * @returns `{ card, detail }` 或 `{ text }`
   */
  async function buildListCard({ selected, error }) {
    const sessions = await catalog.listRecent();
    if (sessions === undefined) return { text: SESSION_NO_WORKSPACE_TEXT };

    const current = sessions.find((session) => session.id === selected);
    const summary = sessions.length > 0
      ? SESSION_CARD_SUMMARY(sessions.length, current ? labelOf(current) : '')
      : SESSION_CARD_EMPTY_TEXT;
    return {
      card: buildOptionCardWithAdd({
        tag: SESSION_LIST_KEY,
        requestId: '',
        title: SESSION_CARD_TITLE,
        groups: [{
          id: '',
          text: error ? `${error}\n${summary}` : summary,
          options: sessions.map((session) => ({ label: labelOf(session), value: session.id })),
        }],
        picked: new Map([['', selected]]),
        confirmText: CONFIRM_TEXT,
        addText: SESSION_NEW_BUTTON_TEXT,
        cancelText: CANCEL_TEXT,
      }),
      detail: `共 ${sessions.length} 个会话`,
    };
  }

  /**
   * 新建一个会话并切过去：落在当前工作区里，没选过工作区就沿用当前会话的目录。
   *
   * @returns `{ card }` 或 `{ error }`
   */
  async function switchToNewSession() {
    const { sessionId: previous } = readSettings();
    // 当前工作区只从 workspaces 这一个口拿：它带「还在不在」的校验，也不读配置里那个原样值。
    const target = await catalog.create({
      cwd: await catalog.cwdOf(previous),
      workspaceId: workspaces.currentWorkspaceId(),
    });
    if (!target) return { error: SESSION_CREATE_FAILED_ERROR };

    await writeSettings({ ...readSettings(), sessionId: target });
    logger.info(`当前会话已切到 ${target}`);
    void catalog.open(target);
    const title = await catalog.titleOf(target);
    return { card: buildTextCard(SESSION_SWITCHED_TEXT(title || target)) };
  }

  const flow = createOptionCardFlow({
    logger,
    push,
    key: SESSION_LIST_KEY,
    label: '会话列表卡片',
    cancelledText: SESSION_LIST_CANCELLED_TEXT,
    staleText: SESSION_LIST_STALE_TEXT,

    /** 发卡时勾当前会话；重画时勾用户点中的那个。 */
    readCard: async ({ selected, error }) => buildListCard({
      selected: selected ?? readSettings().sessionId,
      error,
    }),

    /**
     * 确定：按 ID 现查一遍，然后写设置、切过去。
     *
     * @param deps.pick 选中的会话 ID
     * @returns `{ card }` 或 `{ text }` / `{ error }`
     */
    onConfirm: async ({ pick }) => {
      const sessions = await catalog.listRecent();
      if (sessions === undefined) return { text: SESSION_NO_WORKSPACE_TEXT };
      const chosen = sessions.find((session) => session.id === pick);
      if (chosen === undefined) return { error: SESSION_GONE_ERROR };

      await writeSettings({ ...readSettings(), sessionId: chosen.id });
      logger.info(`当前会话已切到 ${chosen.id}`);
      void catalog.open(chosen.id);
      return { card: buildTextCard(SESSION_SWITCHED_TEXT(labelOf(chosen))) };
    },

    /**
     * 「新建」按钮：新建一个会话并切过去。
     *
     * @param btn 回传的 `btn` 值
     * @returns `{ card }` 或 `{ error }`；不是「新建」时 undefined
     */
    onExtraButton: async (btn) => {
      if (btn !== OPTION_CARD_ADD) return undefined;
      logger.info('会话列表卡片上点了「新建」');
      return switchToNewSession();
    },
  });

  return { pushSessionList: flow.pushCard, handleSessionCard: flow.handleCardAction };
}
