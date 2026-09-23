/** 宿主会话事件这条「连接」：订阅 `session/event`，把每条事件交给装配时给的 `onEvent`。 */
/** 订阅的事件名。 */
const SESSION_EVENT = 'session/event';

/**
 * 建会话事件订阅。
 *
 * @param deps.ctx Cordis 上下文
 * @param deps.logger 日志
 * @returns start / stop
 */
export function createSessionEventsTransport({ ctx, logger }) {
  /** 订阅的 disposer；没订阅时为 undefined。 */
  let dispose;

  /**
   * 订阅；重复调用会先退掉上一次。
   *
   * @param deps.onEvent 收到事件：`(session, event) => void`
   */
  function start({ onEvent }) {
    stop();
    dispose = ctx.on(SESSION_EVENT, (session, event) => onEvent(session, event));
    logger.info(`已订阅 ${SESSION_EVENT}`);
  }

  /**
   * 退订。
   */
  function stop() {
    dispose?.();
    dispose = undefined;
  }

  return { start, stop };
}
