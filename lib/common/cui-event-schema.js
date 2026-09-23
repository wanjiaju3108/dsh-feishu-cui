/** CUI 事件：插件内部统一用这一个结构表示「飞书那边发生了一件事」。 */

/**
 * 建一个 CUI 事件。
 *
 * @param deps.event 顶层事件名
 * @param deps.tag 子事件
 * @param deps.time 发生时间
 * @param deps.content 内容
 * @param deps.messageId 飞书消息 ID
 * @param deps.operatorId 操作者 ID
 * @returns CUI 事件
 */
export function createCuiEvent({ event, tag, time, content, messageId, operatorId }) {
  return { event, tag, time, content, messageId, operatorId };
}
