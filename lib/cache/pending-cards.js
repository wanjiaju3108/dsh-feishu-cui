/** 运行期还在册上的卡片，按卡片功能分开放：菜单卡一张，回答卡一条飞书消息一张。 */

/** 在册上的那张菜单卡。 */
let menuCard;

/**
 * 读在册上的菜单卡。
 *
 * @returns `{ tag, messageId, cancelText }`；没有在册的卡片时三项都是空串
 */
export function readMenuCard() {
  return menuCard ?? { tag: '', messageId: '', cancelText: '' };
}

/**
 * 记下刚发出去的那张菜单卡，顶掉上一张。
 *
 * @param tag 卡片类型（回传给 `action.value.tag` 的那个值）
 * @param messageId 飞书消息 ID；为空时什么都不记
 * @param cancelText 这张卡被顶掉时写在它上面的那句话
 */
export function setMenuCard(tag, messageId, cancelText) {
  if (!messageId) {
    menuCard = undefined;
    return;
  }
  menuCard = { tag, messageId, cancelText: cancelText ?? '' };
}

/** 清掉在册上的菜单卡。 */
export function clearMenuCard() {
  menuCard = undefined;
}

/** 飞书消息 ID → `{ cardId, title, content }`。 */
const answerCards = new Map();

/**
 * 读一张回答卡的记录。
 *
 * @param requestId 飞书消息 ID
 * @returns 记录；没有时 undefined
 */
export function readAnswerCard(requestId) {
  return answerCards.get(requestId);
}

/**
 * 记下一张回答卡。
 *
 * @param requestId 飞书消息 ID
 * @param record `{ cardId, title, content }`
 */
export function writeAnswerCard(requestId, record) {
  answerCards.set(requestId, record);
}

/**
 * 清掉一张回答卡的记录。
 *
 * @param requestId 飞书消息 ID
 */
export function clearAnswerCard(requestId) {
  answerCards.delete(requestId);
}

/**
 * 还有没有留在账上的回答卡。
 *
 * @returns 有的话 true
 */
export function hasAnswerCard() {
  return answerCards.size > 0;
}
