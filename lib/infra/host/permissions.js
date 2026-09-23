/** 权限预设：列这个部署配了哪些、读当前会话是哪个、把会话切到某个，都是会话级的。 */

import {
  PERMISSION_PRESET_LABELS,
  PERMISSION_SERVICE_MISSING_TEXT,
  SESSION_CONTROL_MISSING_TEXT,
  SESSION_HANDLE_MISSING_TEXT,
} from '../../copy.js';

/**
 * 建权限预设封装。
 *
 * @param deps.ctx Cordis 上下文
 * @param deps.logger 日志
 * @param deps.access 宿主服务取用口（`infra/host/service-access.js`）
 * @returns `{ available, labelOf, options, current, set }`
 */
export function createPermissions({ ctx, logger, access }) {
  /**
   * 取权限预设服务。
   *
   * @returns 权限预设服务；没挂载时为 undefined
   */
  function service() {
    return ctx.get('permissionPresets');
  }

  /**
   * 取会话句柄。
   *
   * @param sessionId 会话 ID
   * @returns 会话句柄
   */
  async function sessionOf(sessionId) {
    const attached = ctx.get('sessions')?.get?.(sessionId);
    if (attached) return attached;

    const resolveAgent = access.method('sessionController', 'resolveAgent');
    if (resolveAgent === undefined) throw new Error(SESSION_CONTROL_MISSING_TEXT);
    const resolved = await resolveAgent(sessionId);
    if (resolved?.error) throw new Error(resolved.error.message ?? String(resolved.error));
    const session = resolved?.agent?.session;
    if (!session) throw new Error(SESSION_HANDLE_MISSING_TEXT);
    return session;
  }

  /**
   * 这个部署配了哪些预设（按声明顺序）。
   *
   * @returns 预设名列表；服务缺席时为空数组
   */
  function available() {
    const live = service();
    if (!live || !Array.isArray(live.names)) return [];
    return [...live.names];
  }

  /**
   * 预设的显示名。
   *
   * @param name 预设名
   * @returns 显示名；映射里没有就退回宿主给的 name，最后退回预设名本身
   */
  function labelOf(name) {
    const known = PERMISSION_PRESET_LABELS[name];
    if (known) return known;
    try {
      return service()?.optionOf?.(name)?.name ?? name;
    } catch {
      return name;
    }
  }

  /**
   * 卡片选项：`[{ label, value }]`，按宿主声明顺序，名字用映射里那个。
   *
   * @returns 选项列表；服务缺席时为空数组
   */
  function options() {
    return available().map((name) => ({ label: labelOf(name), value: name }));
  }

  /**
   * 当前会话生效的预设。
   *
   * @param sessionId 会话 ID
   * @returns 预设名（可能是 `custom`）；读不到时 undefined
   */
  async function current(sessionId) {
    const live = service();
    if (!live || typeof live.current !== 'function') {
      logger.warn('没有权限预设服务，读不到当前权限');
      return undefined;
    }
    try {
      return live.current(await sessionOf(sessionId));
    } catch (error) {
      logger.warn(`读当前权限失败：${error?.message ?? error}`);
      return undefined;
    }
  }

  /**
   * 把会话切到某个预设。
   *
   * @param sessionId 会话 ID
   * @param name 预设名
   * @returns `{ ok: true, label }` 或 `{ ok: false, error }`
   */
  async function set(sessionId, name) {
    const live = service();
    if (!live || typeof live.set !== 'function') return { ok: false, error: PERMISSION_SERVICE_MISSING_TEXT };
    try {
      live.set(await sessionOf(sessionId), name);
      return { ok: true, label: labelOf(name) };
    } catch (error) {
      logger.warn(`切换权限到 ${name} 失败：${error?.message ?? error}`);
      return { ok: false, error: error?.message ?? String(error) };
    }
  }

  return { available, labelOf, options, current, set };
}
