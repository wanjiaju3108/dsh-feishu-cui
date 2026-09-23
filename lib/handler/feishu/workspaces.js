/** 工作区列表：菜单里点「工作区列表」时发卡，卡片上点行 / 确定 / 取消时接着办。 */

import {
  CANCEL_TEXT,
  CONFIRM_TEXT,
  WORKSPACE_CARD_EMPTY_TEXT,
  WORKSPACE_CARD_LINE,
  WORKSPACE_CARD_SUMMARY,
  WORKSPACE_CARD_TITLE,
  WORKSPACE_GONE_ERROR,
  WORKSPACE_LIST_CANCELLED_TEXT,
  WORKSPACE_LIST_STALE_TEXT,
  WORKSPACE_SWITCHED_TEXT,
} from '../../common/copy.js';
import { readSettings, writeSettings } from '../../infra/plugin/config.js';
import { buildOptionCard } from '../../ui/option-card.js';
import { buildTextCard } from '../../ui/text-card.js';
import { createOptionCardFlow } from './option-card-flow.js';

/** 这个菜单项的 `event_key`，也是卡片的类型。 */
export const WORKSPACES_KEY = 'workspaces';

/**
 * 工作区在选项里显示成什么。
 *
 * @param workspace 工作区摘要
 * @param duplicated 标题是否重复
 * @returns 显示名
 */
function labelOf(workspace, duplicated) {
  return duplicated ? `${workspace.title}（${workspace.path}）` : workspace.title;
}

/**
 * 建工作区列表处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.workspaces 工作区封装（`infra/host/workspace.js` 的 `createWorkspaces`）
 * @returns pushWorkspaceList / handleWorkspaceCard
 */
export function createWorkspacesHandler({ logger, push, workspaces }) {
  /**
   * 拼一张工作区列表卡片；`error` 有值时写在正文最上面。
   *
   * @param deps.selected 当前勾着的工作区 ID
   * @param deps.error 写回正文最上面的那句话
   * @returns `{ card, detail }`
   */
  function buildListCard({ selected, error }) {
    const list = workspaces.list();
    const countOf = new Map();
    for (const workspace of list) countOf.set(workspace.title, (countOf.get(workspace.title) ?? 0) + 1);
    const label = (workspace) => labelOf(workspace, countOf.get(workspace.title) > 1);

    const current = list.find((workspace) => workspace.workspaceId === selected);
    const lines = [];
    if (list.length > 0) {
      lines.push(WORKSPACE_CARD_SUMMARY(list.length, current ? label(current) : ''));
      if (list.some((workspace) => countOf.get(workspace.title) > 1)) {
        for (const workspace of list) lines.push(WORKSPACE_CARD_LINE(workspace.title, workspace.path));
      }
    } else {
      lines.push(WORKSPACE_CARD_EMPTY_TEXT);
    }

    return {
      card: buildOptionCard({
        tag: WORKSPACES_KEY,
        requestId: '',
        title: WORKSPACE_CARD_TITLE,
        groups: [{
          id: '',
          text: error ? `${error}\n${lines.join('\n')}` : lines.join('\n'),
          options: list.map((workspace) => ({ label: label(workspace), value: workspace.workspaceId })),
        }],
        picked: new Map([['', selected]]),
        confirmText: CONFIRM_TEXT,
        cancelText: CANCEL_TEXT,
      }),
      detail: `共 ${list.length} 个工作区`,
    };
  }

  const flow = createOptionCardFlow({
    logger,
    push,
    key: WORKSPACES_KEY,
    label: '工作区列表卡片',
    cancelledText: WORKSPACE_LIST_CANCELLED_TEXT,
    staleText: WORKSPACE_LIST_STALE_TEXT,

    /** 发卡时勾当前工作区；重画时勾用户点中的那个。 */
    readCard: async ({ selected, error }) => buildListCard({
      selected: selected ?? workspaces.currentWorkspaceId(),
      error,
    }),

    /**
     * 确定：按 ID 现查一遍，然后把选中的写进设置。
     *
     * @param deps.pick 选中的工作区 ID
     * @returns `{ card }` 或 `{ error }`
     */
    onConfirm: async ({ pick }) => {
      const target = workspaces.list().find((workspace) => workspace.workspaceId === pick);
      if (target === undefined) return { error: WORKSPACE_GONE_ERROR };

      await writeSettings({ ...readSettings(), workspaceId: target.workspaceId });
      logger.info(`当前工作区已切到 ${target.title}（${target.path}）`);
      return { card: buildTextCard(WORKSPACE_SWITCHED_TEXT(target.title)) };
    },
  });

  return { pushWorkspaceList: flow.pushCard, handleWorkspaceCard: flow.handleCardAction };
}
