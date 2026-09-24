/** 工作区：读已注册的工作区，回答「当前是哪个」。 */

import { getSettingsHandle } from '../../cache/settings-handle.js';
import { readConfigField } from '../common/config-field.js';

/**
 * 建工作区封装。
 *
 * @param deps.logger 日志
 * @param deps.access 宿主服务取用口（`infra/host/service-access.js`）
 * @returns list / archivedSessionIds / idOfSession / currentWorkspaceId
 */
export function createWorkspaces({ logger, access }) {
  /**
   * 列已注册的工作区。
   *
   * @returns `{ workspaceId, title, path, sessionCount, sessionIds }[]`；服务缺席或读失败时为空数组
   */
  function list() {
    const registry = access.service('workspaceRegistry');
    if (!registry || typeof registry.list !== 'function') return [];
    try {
      return registry.list().map((workspace) => {
        const sessionIds = Array.isArray(workspace.sessionIds) ? [...workspace.sessionIds] : [];
        return {
          workspaceId: workspace.id,
          title: workspace.title || workspace.path,
          path: workspace.path,
          sessionCount: sessionIds.length,
          sessionIds,
        };
      });
    } catch (error) {
      logger.warn(`读工作区列表失败：${error?.message ?? error}`);
      return [];
    }
  }

  /**
   * 归档的会话 ID：这些会话从所有分组里隐藏。
   *
   * @returns 归档的会话 ID 列表；读不到时为空数组
   */
  function archivedSessionIds() {
    const registry = access.service('workspaceRegistry');
    try {
      return [...(registry?.archivedSessionIds ?? [])];
    } catch (error) {
      logger.warn(`读归档会话列表失败：${error?.message ?? error}`);
      return [];
    }
  }

  /**
   * 某个会话归在哪个工作区里。
   *
   * @param sessionId 会话 ID
   * @returns 工作区 ID；没有（或该会话不在任何工作区里）时为空串
   */
  function idOfSession(sessionId) {
    if (!sessionId) return '';
    const found = list().find((workspace) => workspace.sessionIds.includes(sessionId));
    return found?.workspaceId ?? '';
  }

  /**
   * 当前工作区：设置里选过的那个；没选过就用当前会话所在的工作区兜底。
   *
   * 选过的那个已经不在注册表里（工作区被删了）→ 空串，也就是「没有当前工作区」，不再拿会话去猜。
   * 没选过 → 用当前会话反推；反推不出来也是空串。
   *
   * 配置自己读：句柄在 `cache/settings-handle.js`、拆 volatile 引用在 `infra/common/`，
   * 都够得着，所以不必反过来 import `infra/plugin/`。
   *
   * @returns 工作区 ID；没有有效的那个时为空串
   */
  function currentWorkspaceId() {
    const { config } = getSettingsHandle() ?? {};
    const workspaceId = readConfigField(config?.workspaceId, '');
    const sessionId = readConfigField(config?.sessionId, '');
    if (workspaceId) {
      return list().some((workspace) => workspace.workspaceId === workspaceId) ? workspaceId : '';
    }
    return idOfSession(sessionId);
  }

  return { list, archivedSessionIds, idOfSession, currentWorkspaceId };
}
