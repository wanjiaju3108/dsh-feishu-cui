/** 后台提交，再把结果作为一张新卡发回去。选项卡与输入框卡片共用这一份。 */

import { buildTextCard } from '../../ui/text-card.js';

/**
 * 提交一次，再把结果发成一张新卡。
 *
 * `submit` 返回 `undefined` 表示成功且不用发卡（结果由别处来说）、`{ text }` / `{ card }` 表示就发这张、
 * `{ error }` 表示把这句话作为失败原因发出去；抛错按 `{ text }` 处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.label 日志里怎么称呼这张卡（「模型卡片」）
 * @param deps.target 结果发给谁：`{ openId }`
 * @param deps.decided 点确定时给的那一份（`{ submit }`）
 */
export async function submitThenCard({ logger, push, label, target, decided }) {
  let after;
  try {
    after = await decided.submit();
  } catch (error) {
    logger.warn(`${label}提交失败：${error?.message ?? error}`);
    after = { text: String(error?.message ?? error) };
  }
  if (after === undefined) return;
  const line = after.text !== undefined ? after.text : after.error;
  const card = line !== undefined ? buildTextCard(line) : after.card;
  if (card === undefined) return;
  await push.sendCard(target, card);
}
