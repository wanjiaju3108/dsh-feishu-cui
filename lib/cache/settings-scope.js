/** 设置命名空间句柄：宿主设置服务给 `SETTINGS_NAMESPACE` 注册出来的那个 owner scope。 */

/** `settings.register(...)` 的返回值；还没注册时为 undefined。 */
let settingsScope;

/**
 * 存下注册出来的 owner scope。
 *
 * @param scope `settings.register(...)` 的返回值
 */
export function setSettingsScope(scope) {
  settingsScope = scope;
}

/**
 * 取设置命名空间的 owner scope。
 *
 * @returns owner scope；还没注册时为 undefined
 */
export function getSettingsScope() {
  return settingsScope;
}
