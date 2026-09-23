/** 传输层主件：按一组凭据把长连接客户端和 REST 客户端一起造出来、一起换、一起废。 */
import { APP_ID_REF, APP_SECRET_REF } from '../../common/credential-refs.js';

import { createHttpClient } from './http-client.js';
import { createWebsocketClient } from './websocket-client.js';

/** 没有凭据时不建连，报给 `onStatus` 的那句话（只进日志，不给人看）。 */
const NO_CREDENTIALS_ERROR = `未配置飞书凭据（${APP_ID_REF} / ${APP_SECRET_REF}），请在设置页填写`;

/**
 * 建传输层。
 *
 * @param deps.logger 日志
 * @returns start / stop / rest / status
 */
export function createTransport({ logger }) {
  /** 当前这一组客户端：`{ link, rest }`；没凭据时为 undefined。 */
  let current;

  /** 最近一次 start 传入的状态回调；stop 时用它报一次断开。 */
  let notify = () => {};

  /**
   * 废掉当前这一组：长连接关掉、发消息的客户端丢掉。
   */
  function stop() {
    const previous = current;
    current = undefined;
    notify({ connected: false });
    if (!previous) return;
    try {
      previous.link.stop();
    } catch (error) {
      logger.warn(`关闭飞书长连接失败：${error?.message ?? error}`);
    }
  }

  /**
   * 按给定凭据重建这一组；凭据不全只报状态，不建。
   *
   * @param deps.appId 应用 ID
   * @param deps.appSecret 应用密钥
   * @param deps.onEvent 收到飞书事件：`(type, payload) => any`
   * @param deps.onStatus 连接状态变化：`({ connected, error }) => void`
   */
  function start({ appId, appSecret, onEvent, onStatus }) {
    stop();
    notify = onStatus;
    if (!appId || !appSecret) {
      logger.warn(NO_CREDENTIALS_ERROR);
      onStatus({ connected: false, error: NO_CREDENTIALS_ERROR });
      return;
    }

    const rest = createHttpClient({ appId, appSecret });
    const link = createWebsocketClient({ logger, appId, appSecret, onEvent, onStatus });
    current = { link, rest };
    link.start();
    logger.info(`飞书长连接启动中（App ID ${appId.slice(0, 8)}…）`);
  }

  /**
   * 出站用的 REST 客户端；没凭据（或还没 start）时为 undefined。
   *
   * @returns REST 客户端
   */
  function rest() {
    return current?.rest;
  }

  /**
   * 现在的连接状态。
   *
   * @returns SDK 的状态对象
   */
  function status() {
    return current?.link.status() ?? { state: 'idle' };
  }

  return { start, stop, rest, status };
}
