/** 卡片共用件：卡片 JSON 版本、正文元素、按钮、按钮行，以及量卡片体积。 */

/** 卡片 JSON 版本。 */
export const CARD_SCHEMA_VERSION = '2.0';

/** 按钮回传动作的行为类型。 */
export const CARD_CALLBACK_BEHAVIOR = 'callback';

/** 「确定」按钮回传的 `btn` 值。 */
export const CARD_BUTTON_CONFIRM = 'confirm';

/** 「取消」按钮回传的 `btn` 值。 */
export const CARD_BUTTON_CANCEL = 'cancel';

/** 卡片体积上限（官方限制 30KB）。 */
export const CARD_MAX_BYTES = 30 * 1024;

/**
 * 量一张卡片序列化后有多少字节。
 *
 * @param card 卡片对象
 * @returns 字节数
 */
export function cardBytes(card) {
  return new TextEncoder().encode(JSON.stringify(card)).length;
}

/**
 * 造一个正文元素。
 *
 * @param content 正文（markdown）
 * @returns 卡片元素
 */
export function markdownElement(content) {
  return { tag: 'markdown', content };
}

/**
 * 造一个按钮。
 *
 * @param options 按钮的各个字段
 * @param options.name 组件名（同一张卡片里要唯一）
 * @param options.text 按钮上显示的字
 * @param options.type 按钮样式（`primary` / `default` 这类）
 * @param options.submit 传 true 时这颗按钮点了提交所在表单（多带一个 `form_action_type`）
 * @param options.value 点击后原样回传的参数
 * @returns 按钮元素
 */
export function buildButton({ name, text, type, submit, value }) {
  return {
    tag: 'button',
    name,
    type,
    text: { tag: 'plain_text', content: text },
    ...submit ? { form_action_type: 'submit' } : {},
    behaviors: [{ type: CARD_CALLBACK_BEHAVIOR, value }],
  };
}

/**
 * 把卡片包成「把原来那张换成这张」的回调响应。
 *
 * @param card 新卡片
 * @returns 回调响应对象
 */
export function cardResponse(card) {
  return { card: { type: 'raw', data: card } };
}

/**
 * 把一串按钮排成一行（每列等宽）。
 *
 * @param buttons 按钮元素列表
 * @returns 分栏元素
 */
export function buildButtonColumns(buttons) {
  return {
    tag: 'column_set',
    columns: buttons.map((button) => ({ tag: 'column', width: 'weighted', weight: 1, elements: [button] })),
  };
}
