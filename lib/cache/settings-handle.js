/** 设置句柄：宿主设置服务，以及插件条目 apply 收到的 config。 */

/** 宿主设置服务与条目 config；还没绑定时为 undefined。 */
let settingsHandle;

/**
 * 存下宿主设置服务与条目 config。
 *
 * @param handle `{ settings, config }`
 */
export function setSettingsHandle(handle) {
  settingsHandle = handle;
}

/**
 * 取设置句柄。
 *
 * @returns `{ settings, config }`；还没绑定时 undefined
 */
export function getSettingsHandle() {
  return settingsHandle;
}
