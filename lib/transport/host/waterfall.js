/** 宿主那条 waterfall 的「连接」：按事件名订阅，把每次请求交给装配时给的 `onRequest`；现在反问与审批各建一个实例。 */
/**
 * 建一个 waterfall 订阅。
 *
 * @param deps.ctx Cordis 上下文
 * @param deps.logger 日志
 * @param deps.event 事件名
 * @returns start / stop
 */
export function createWaterfallTransport({ ctx, logger, event }) {
  /** 订阅的 disposer；没订阅时为 undefined。 */
  let dispose;

  /**
   * 订阅；重复调用会先退掉上一次。
   *
   * @param deps.onRequest 收到请求：`(request, next) => Promise<answer>`
   */
  function start({ onRequest }) {
    stop();
    dispose = ctx.on(event, (request, next) => onRequest(request, next), { prepend: true });
    logger.info(`已订阅 ${event}`);
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
