/** 设置页的数据面：状态快照、凭据读写、解绑，以及挂在回环上的那三条路由。 */

import { APP_ID_REF, APP_SECRET_REF } from '../common/credential-refs.js';
import { CREDENTIALS_ROUTE, STATE_ROUTE, UNBIND_USER_ROUTE } from './routes.js';

import { readPairingCode } from '../cache/pairing.js';
import { readSettings } from '../infra/plugin/config.js';
import { registerJsonRoute } from './http.js';

/**
 * 建设置页面板。
 *
 * @param deps.ctx Cordis 上下文
 * @param deps.store 凭据存储
 * @param deps.readCredentials 读当前凭据：`() => { appId, appSecret }`
 * @param deps.reconnect 按新凭据重建连接：`(credentials) => void`
 * @param deps.unbindUser 解绑当前 user：`() => Promise<void>`
 * @param deps.readStatus 读连接状态：`() => ({ state })`
 * @returns register / buildSnapshot
 */
export function createSettingsPanel({
  ctx,
  store,
  readCredentials,
  reconnect,
  unbindUser,
  readStatus,
}) {
  /**
   * 拼设置页要的状态快照。
   *
   * @returns 状态快照
   */
  async function buildSnapshot() {
    const { userId } = readSettings();
    const { state } = readStatus();
    const connected = state === 'connected';
    const [appId, appSecret] = await Promise.all([
      store.describe(APP_ID_REF),
      store.describe(APP_SECRET_REF),
    ]);
    return {
      connected,
      userId,
      // 当前配对码：没有在册的码就是 null。
      pairingCode: readPairingCode() || null,
      appIdConfigured: appId.configured,
      appSecretConfigured: appSecret.configured,
      appIdWritable: appId.writable,
      appSecretWritable: appSecret.writable,
    };
  }

  /**
   * 保存设置页写入的凭据，再按新凭据重建连接。
   *
   * @param body 设置页提交的内容；空字符串表示不改这一项
   */
  async function saveCredentials(body) {
    if (typeof body?.appId === 'string' && body.appId.trim()) {
      await store.write(APP_ID_REF, body.appId.trim());
    }
    if (typeof body?.appSecret === 'string' && body.appSecret.trim()) {
      await store.write(APP_SECRET_REF, body.appSecret.trim());
    }
    reconnect(await readCredentials());
  }

  /**
   * 把三条路由挂到 Web 服务器上。
   */
  function register() {
    const webServer = ctx.get('webServer');
    registerJsonRoute({ ctx, webServer, path: STATE_ROUTE, method: 'GET', handle: () => buildSnapshot() });
    registerJsonRoute({
      ctx,
      webServer,
      path: CREDENTIALS_ROUTE,
      method: 'POST',
      handle: (body) => saveCredentials(body).then(buildSnapshot),
    });
    registerJsonRoute({
      ctx,
      webServer,
      path: UNBIND_USER_ROUTE,
      method: 'POST',
      handle: () => unbindUser().then(buildSnapshot),
    });
  }

  return { register, buildSnapshot };
}
