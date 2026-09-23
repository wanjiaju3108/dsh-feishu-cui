/** 正在跑的那一轮：哪条飞书消息在跑。 */

/** 在跑的那一轮；没有时 undefined。 */
let runningTurn;

/**
 * 读某一轮是哪条飞书消息在跑。
 *
 * @param turn turn 号
 * @returns 飞书消息 ID；不是这一轮时没有
 */
export function readRunningTurn(turn) {
  if (!runningTurn || runningTurn.turn !== turn) return;
  return runningTurn.requestId;
}

/**
 * 记下某一轮是哪条飞书消息在跑（顶掉槽里原来那一轮）。
 *
 * @param turn turn 号
 * @param requestId 飞书消息 ID
 */
export function setRunningTurn(turn, requestId) {
  runningTurn = { turn, requestId };
}

/**
 * 现在有没有正在跑的、跟我们有关的那一轮。
 *
 * @returns 有的话 true
 */
export function hasRunningTurn() {
  return runningTurn !== undefined;
}

/**
 * 清掉这一轮的记录；槽里是别的轮次就什么都不动。
 *
 * @param turn turn 号
 */
export function clearRunningTurn(turn) {
  if (runningTurn?.turn === turn) runningTurn = undefined;
}
