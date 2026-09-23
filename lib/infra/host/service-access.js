/** 宿主服务取用口：按服务名 + 方法名借一个绑好 `this` 的方法。 */

/**
 * 建宿主服务取用口。
 *
 * @param deps.ctx Cordis 上下文
 * @param deps.logger 日志
 * @returns 取用口对象，含 `method`
 */
export function createServiceAccess({ ctx, logger }) {
  const missing = new Set();

  /**
   * 借某个服务上的一个方法。
   *
   * @param service 宿主服务名（`ctx.get` 用的那个原名：`sessionController` 等）
   * @param name 方法名（服务上的原名：`resolveAgent` / `create` 等）
   * @returns 绑好 `this` 的方法；没挂载或不支持时 undefined
   */
  function method(service, name) {
    const live = ctx.get(service);
    if (!live) return undefined;
    if (typeof live[name] !== 'function') {
      const key = `${service}.${name}`;
      if (!missing.has(key)) {
        missing.add(key);
        logger.warn(`宿主服务 ${service} 没有 ${name} 方法`);
      }
      return undefined;
    }
    return live[name].bind(live);
  }

  return { method };
}
