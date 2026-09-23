/** 输入框卡片：标题 + 说明 + 一个输入框 + 「确定」「取消」。只有配对那张卡用。 */

import {
  CARD_BUTTON_CANCEL,
  CARD_BUTTON_CONFIRM,
  CARD_SCHEMA_VERSION,
  buildButton,
  buildButtonColumns,
  markdownElement,
} from './card.js';

/** 「确定」按钮回传的 `btn` 值。 */
export const INPUT_CARD_CONFIRM = CARD_BUTTON_CONFIRM;

/** 「取消」按钮回传的 `btn` 值。 */
export const INPUT_CARD_CANCEL = CARD_BUTTON_CANCEL;

/** 表单的组件名。 */
export const INPUT_CARD_FORM_NAME = 'input_form';

/** 输入框的组件名，也是回传 `form_value` 里的键——调用方按它取用户输入的内容。 */
export const INPUT_CARD_FIELD_NAME = 'input';

/** 「确定」按钮的组件名。 */
const CONFIRM_BUTTON_NAME = 'input_confirm';

/** 「取消」按钮的组件名。 */
const CANCEL_BUTTON_NAME = 'input_cancel';

/**
 * 造一张输入框卡片。
 *
 * @param deps.tag 卡片类型（回传到 `action.value.tag`）
 * @param deps.title 卡片标题
 * @param deps.description 标题下面那段说明（markdown）
 * @param deps.placeholder 输入框的占位文案
 * @param deps.confirmText 「确定」按钮文案
 * @param deps.cancelText 「取消」按钮文案
 * @returns 卡片对象
 */
export function buildInputCard({ tag, title, description, placeholder, confirmText, cancelText }) {
  return {
    schema: CARD_SCHEMA_VERSION,
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: title },
    },
    body: {
      elements: [
        markdownElement(description),
        {
          tag: 'form',
          name: INPUT_CARD_FORM_NAME,
          elements: [
            {
              tag: 'input',
              name: INPUT_CARD_FIELD_NAME,
              required: true,
              width: 'fill',
              placeholder: { tag: 'plain_text', content: placeholder },
            },
            buildButtonColumns([
              buildButton({
                name: CONFIRM_BUTTON_NAME,
                text: confirmText,
                type: 'primary',
                submit: true,
                value: { tag, btn: INPUT_CARD_CONFIRM },
              }),
              buildButton({
                name: CANCEL_BUTTON_NAME,
                text: cancelText,
                type: 'default',
                value: { tag, btn: INPUT_CARD_CANCEL },
              }),
            ]),
          ],
        },
      ],
    },
  };
}
