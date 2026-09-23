/** 宿主会话事件的准入：不是当前会话的、没有类型的，丢掉。 */

/**
 * 建准入判定器。
 *
 * @param deps.readSettings 现读设置：`() => ({ sessionId, … })`
 * @returns admit
 */
export function createAdmission({ readSettings }) {
  /**
   * 判一条内部事件过不过。
   *
   * @param internal 内部事件（`driving/host/receiver.js` 转出来的）
   * @returns `{ code, reason }`：0 通过，1 丢弃（`reason` 进日志）
   */
  function admit(internal) {
    if (!internal.tag) return { code: 1, reason: '这条会话事件没有类型' };
    if (internal.sessionId !== readSettings().sessionId) {
      return { code: 1, reason: `不是当前会话的事件（${internal.sessionId || '无会话 ID'}）` };
    }
    return { code: 0 };
  }

  return { admit };
}
