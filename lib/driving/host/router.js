/** 宿主事件路由：拿准入判定和内部事件，按 `event` 与 `tag` 决定交给谁。 */

import { WATCHED_SESSION_EVENTS } from '../../handler/host/settings-watch.js';

/**
 * 建宿主事件路由器。
 *
 * @param deps.answer 回答卡片：`{ onSession(internalEvent), onAgent(internalEvent) }`
 * @param deps.settingsWatch 会话设置监视：`{ onSession(internalEvent) }`
 * @returns route
 */
export function createRouter({ answer, settingsWatch }) {
  /** 谁关心哪几条：`event` + `tag` 定一件，同一件可以给多家。 */
  const routes = [
    { event: 'session', tags: ['assistant/message', 'turn/end'], handle: (internal) => answer.onSession(internal) },
    { event: 'session', tags: WATCHED_SESSION_EVENTS, handle: (internal) => settingsWatch.onSession(internal) },
    { event: 'agent', tags: ['inbox/inserted', 'inbox/claimed', 'inbox/discarded'], handle: (internal) => answer.onAgent(internal) },
  ];

  /**
   * 按 `code`、`event` 与 `tag` 分流。
   *
   * @param code 准入判定里的 code：0 通过，1 丢弃
   * @param internal 内部事件（`driving/host/receiver.js` 转出来的）
   * @returns undefined（宿主事件是通知型，没有回执）
   */
  async function route(code, internal) {
    if (code !== 0) return undefined;

    const matched = routes.filter((entry) => entry.event === internal.event && entry.tags.includes(internal.tag));
    for (const entry of matched) await entry.handle(internal);
    return undefined;
  }

  return { route };
}
