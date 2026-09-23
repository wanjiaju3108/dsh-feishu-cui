/** 宿主服务取用口：按服务名借服务本身，或借它上面一个绑好 `this` 的方法。 */

/**
 * 建宿主服务取用口。
 *
 * @param deps.ctx Cordis 上下文
 * @param deps.logger 日志
 * @returns 取用口对象，含 `service` 与 `method`
 */
export function createServiceAccess({ ctx, logger }) {
  /** 已经警告过的键：同一件事只警告一次。 */
  const warned = new Set();

  /**
   * 只警告一次。
   *
   * @param key 去重用的键
   * @param message 那句话
   */
  function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    logger.warn(message);
  }

  /**
   * 借一个宿主服务本身。
   *
   * @param name 宿主服务名（`ctx.get` 用的那个原名：`workspaceRegistry` 等）
   * @returns 服务；没挂载时 undefined
   */
  function service(name) {
    const live = ctx.get(name);
    if (!live) warnOnce(name, `宿主没有 ${name} 服务`);
    return live;
  }

  /**
   * 借某个服务上的一个方法。
   *
   * @param name 宿主服务名
   * @param methodName 方法名（服务上的原名：`resolveAgent` / `create` 等）
   * @returns 绑好 `this` 的方法；没服务、或服务上没有这个方法时 undefined
   */
  function method(name, methodName) {
    const live = service(name);
    if (!live) return undefined;
    if (typeof live[methodName] !== 'function') {
      warnOnce(`${name}.${methodName}`, `宿主服务 ${name} 没有 ${methodName} 方法`);
      return undefined;
    }
    return live[methodName].bind(live);
  }

  return { service, method };
}
