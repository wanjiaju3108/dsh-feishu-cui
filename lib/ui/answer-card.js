/** 回答卡片：带一个按钮的那种（排队中「撤回」、处理中「停止」）。没有按钮的终态走 `text-card.js` 的 `buildHeaderTextCard`。 */

import { CARD_SCHEMA_VERSION, buildButton, buildButtonColumns, markdownElement } from './card.js';

/** 卡片类型，也是回调里 `action.value.tag` 的那个值。 */
export const ANSWER_CARD_KEY = 'answer';

/** 「停止」按钮回传的 `btn` 值。 */
export const ANSWER_CARD_BTN_STOP = 'stop';

/** 「撤回」按钮回传的 `btn` 值。 */
export const ANSWER_CARD_BTN_WITHDRAW = 'withdraw';

/**
 * 造一张带一个按钮的回答卡片。
 *
 * @param deps.title 状态标题（`copy.js` 里 `ANSWER_*` 那几个）
 * @param deps.color 标题栏颜色（飞书 `InteractiveCardHeaderTemplate` 的取值）
 * @param deps.content 正文（markdown）；刚发卡时是空串
 * @param deps.action 卡片上那个按钮：`{ btn, text, requestId }`
 * @returns 卡片对象
 */
export function buildAnswerCard({ title, color, content, action }) {
  return {
    schema: CARD_SCHEMA_VERSION,
    header: {
      template: color,
      title: { tag: 'plain_text', content: title },
    },
    body: {
      elements: [
        markdownElement(content),
        buildButtonColumns([
          buildButton({
            name: 'answer_action',
            text: action.text,
            type: 'default',
            value: { tag: ANSWER_CARD_KEY, btn: action.btn, requestId: action.requestId },
          }),
        ]),
      ],
    },
  };
}
