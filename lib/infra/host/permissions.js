/** 权限预设：列这个部署配了哪些、读当前会话是哪个、把会话切到某个，都是会话级的。 */

/** 提交失败的原因：宿主没有权限预设服务。 */
export const NO_PRESET_SERVICE_REASON = 'no-preset-service';

/** 提交失败的原因：没有会话控制器。 */
export const NO_SESSION_CONTROLLER_REASON = 'no-session-controller';

/** 提交失败的原因：resolveAgent 没给出会话句柄。 */
export const NO_SESSION_HANDLE_REASON = 'no-session-handle';

/**
 * 造一个带原因的错：原因给上层翻译成卡片上的话，消息只进日志。
 *
 * @param reason 失败原因
 * @param message 日志里那句话
 * @returns 错误对象
 */
function markFailure(reason, message) {
  const error = new Error(message);
  error.reason = reason;
  return error;
}

/**
 * 建权限预设封装。
 *
 * @param deps.logger 日志
 * @param deps.access 宿主服务取用口（`infra/host/service-access.js`）
 * @returns `{ available, displayNameOf, current, set }`
 */
export function createPermissions({ logger, access }) {
  /**
   * 取权限预设服务。
   *
   * @returns 权限预设服务；没挂载时为 undefined
   */
  function service() {
    return access.service('permissionPresets');
  }

  /**
   * 取会话句柄。
   *
   * @param sessionId 会话 ID
   * @returns 会话句柄
   */
  async function sessionOf(sessionId) {
    const attached = access.service('sessions')?.get?.(sessionId);
    if (attached) return attached;

    const resolveAgent = access.method('sessionController', 'resolveAgent');
    if (resolveAgent === undefined) throw markFailure(NO_SESSION_CONTROLLER_REASON, '没有会话控制器');
    const resolved = await resolveAgent(sessionId);
    if (resolved?.error) throw new Error(resolved.error.message ?? String(resolved.error));
    const session = resolved?.agent?.session;
    if (!session) throw markFailure(NO_SESSION_HANDLE_REASON, 'resolveAgent 没给出会话句柄');
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
   * 宿主自己怎么称呼这个预设。
   *
   * @param name 预设名
   * @returns 宿主给的名字；问不到时退回预设名本身
   */
  function displayNameOf(name) {
    try {
      return service()?.optionOf?.(name)?.name ?? name;
    } catch {
      return name;
    }
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
   * @returns `{ ok: true }`，或 `{ ok: false, reason, message }`（`reason` 认不出时看 `message`）
   */
  async function set(sessionId, name) {
    const live = service();
    if (!live || typeof live.set !== 'function') return { ok: false, reason: NO_PRESET_SERVICE_REASON };
    try {
      live.set(await sessionOf(sessionId), name);
      return { ok: true };
    } catch (error) {
      logger.warn(`切换权限到 ${name} 失败：${error?.message ?? error}`);
      return { ok: false, reason: error?.reason, message: error?.message ?? String(error) };
    }
  }

  return { available, displayNameOf, current, set };
}
