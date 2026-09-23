/** 审批卡片：待批那张（一段正文 + 「允许」「拒绝」两个按钮）。批完换成 `text-card.js` 的 `buildHeaderTextCard`。 */

import {
  CARD_SCHEMA_VERSION,
  buildButton,
  buildButtonColumns,
  markdownElement,
} from './card.js';

/** 卡片类型，也是回调里 `action.value.tag` 的那个值。 */
export const APPROVAL_CARD_KEY = 'approval';

/** 「允许」按钮回传的 `btn` 值。 */
export const APPROVAL_CARD_BTN_ALLOW = 'allow';

/** 「拒绝」按钮回传的 `btn` 值。 */
export const APPROVAL_CARD_BTN_REJECT = 'reject';

/**
 * 造一张待批的审批卡片。
 *
 * @param deps.requestId 这次请求的身份（回调里原样带回来）
 * @param deps.title 卡片标题
 * @param deps.content 正文（哪个工具、为什么要授权）
 * @param deps.allowText 「允许」按钮文案
 * @param deps.rejectText 「拒绝」按钮文案
 * @returns 卡片对象
 */
export function buildApprovalCard({ requestId, title, content, allowText, rejectText }) {
  return {
    schema: CARD_SCHEMA_VERSION,
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: title },
    },
    body: {
      elements: [
        markdownElement(content),
        buildButtonColumns([
          buildButton({
            name: 'approval_allow',
            text: allowText,
            type: 'primary',
            value: { tag: APPROVAL_CARD_KEY, btn: APPROVAL_CARD_BTN_ALLOW, requestId },
          }),
          buildButton({
            name: 'approval_reject',
            text: rejectText,
            type: 'default',
            value: { tag: APPROVAL_CARD_KEY, btn: APPROVAL_CARD_BTN_REJECT, requestId },
          }),
        ]),
      ],
    },
  };
}
