/** 在册记录的主键：反问卡、审批卡各按自己的 `requestId` 记一条。 */

/** 铸号用的序号。 */
let seq = 0;

/**
 * 铸一个号。
 *
 * @param kind 这次提问的种类（`question` / `approval`）
 * @returns 主键
 */
export function nextRequestId(kind) {
  seq += 1;
  return `${kind}-${Date.now().toString(36)}-${seq}`;
}
