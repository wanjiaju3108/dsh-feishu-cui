/** 设置页那四条回环路由的路径：状态、凭据保存、解绑 user、防休眠开关。 */

/** 路由前缀；设置页的 URL 都挂在它下面。 */
export const SETTINGS_BASE_PATH = '/dsh-feishu-cui';

/** 页面读状态：连接状态、绑定的人、配对码、凭据配没配。 */
export const STATE_ROUTE = `${SETTINGS_BASE_PATH}/state`;

/** 页面保存飞书凭据。 */
export const CREDENTIALS_ROUTE = `${SETTINGS_BASE_PATH}/credentials`;

/** 页面解绑：把绑定的人清掉。 */
export const UNBIND_USER_ROUTE = `${SETTINGS_BASE_PATH}/user/unbind`;

/** 页面开关防休眠。 */
export const SLEEP_GUARD_ROUTE = `${SETTINGS_BASE_PATH}/sleep-guard`;
