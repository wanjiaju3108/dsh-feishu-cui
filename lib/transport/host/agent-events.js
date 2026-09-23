/** 宿主 agent 事件这条「连接」：订阅队列与轮次那几条，把每条交给装配时给的 `onEvent`。 */
/** 订阅的事件名。 */
const SUBSCRIBED_EVENTS = ['agent/inbox/inserted', 'agent/inbox/claimed', 'agent/inbox/discarded'];

/** 事件名前缀，转内部 tag 时去掉。 */
const PREFIX = 'agent/';

/**
 * 建 agent 事件订阅。
 *
 * @param deps.ctx Cordis 上下文
 * @param deps.logger 日志
 * @returns start / stop
 */
export function createAgentEventsTransport({ ctx, logger }) {
  /** 订阅的 disposer 列表。 */
  let disposers = [];

  /**
   * 订阅；重复调用会先退掉上一次。
   *
   * @param deps.onEvent 收到事件：`(tag, payload) => void`
   */
  function start({ onEvent }) {
    stop();
    disposers = SUBSCRIBED_EVENTS.map((name) => ctx.on(name, (payload) => onEvent(name.slice(PREFIX.length), payload)));
    logger.info(`已订阅 ${SUBSCRIBED_EVENTS.join('、')}`);
  }

  /**
   * 退订。
   */
  function stop() {
    for (const dispose of disposers) dispose();
    disposers = [];
  }

  return { start, stop };
}
