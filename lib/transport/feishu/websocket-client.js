/** 飞书长连接客户端：收事件的那一半，负责建连、启停、重连与状态回调。 */
import { Domain, EventDispatcher, LoggerLevel, WSClient } from '@larksuiteoapi/node-sdk';

import { SUBSCRIBED_EVENT_TYPES } from '../../common/feishu-event.js';

/** 发出去的 ping 等这么久（秒）还没收到任何回帧，就判定这条连接死了，拆掉重连。 */
export const WS_PING_TIMEOUT_SEC = 15;

/**
 * 长连接报错时日志里那句话（只进日志，不给人看）。
 *
 * @param reason 报错原因
 * @returns 前缀加上原因
 */
function describeError(reason) {
  return `长连接错误：${reason}`;
}

/**
 * 建一条长连接。
 *
 * @param deps.logger 日志
 * @param deps.appId 应用 ID
 * @param deps.appSecret 应用密钥
 * @param deps.onEvent 收到事件：`(type, payload) => any`
 * @param deps.onStatus 连接状态变化：`({ connected, error }) => void`
 * @returns start / stop / status
 */
export function createWebsocketClient({ logger, appId, appSecret, onEvent, onStatus }) {
  const dispatcher = new EventDispatcher({});
  for (const type of SUBSCRIBED_EVENT_TYPES) {
    dispatcher.register({ [type]: (data) => onEvent(type, data) });
  }

  const ws = new WSClient({
    appId,
    appSecret,
    domain: Domain.Feishu,
    loggerLevel: LoggerLevel.info,
    autoReconnect: true,
    wsConfig: { pingTimeout: WS_PING_TIMEOUT_SEC },
    onReady: () => {
      logger.info('飞书长连接已建立');
      onStatus({ connected: true });
    },
    onReconnecting: () => {
      logger.warn('飞书长连接断开，开始重连');
      onStatus({ connected: false });
    },
    onReconnected: () => {
      logger.info('飞书长连接已重连');
      onStatus({ connected: true });
    },
    onError: (error) => {
      const message = describeError(error?.message ?? error);
      logger.error(message);
      onStatus({ connected: false, error: message });
    },
  });

  return {
    /**
     * 启动长连接，事件交给 dispatcher 分发。
     *
     * @returns SDK `start` 的返回值
     */
    start: () => ws.start({ eventDispatcher: dispatcher }),
    /**
     * 关掉长连接。
     *
     * @returns SDK `close` 的返回值
     */
    stop: () => ws.close({ force: true }),
    /**
     * 当前的连接状态。
     *
     * @returns SDK 自己算的连接状态对象
     */
    status: () => ws.getConnectionStatus(),
  };
}
