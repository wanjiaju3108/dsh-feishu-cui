/** 选项卡：顶上一行状态 + 若干组（每组一段文字 + 一行一个选项）+ 底部一排按钮。两种定型：`buildOptionCard`（确定 | 取消）、`buildOptionCardWithAdd`（确定 | 新建 | 取消）。 */

import {
  CARD_BUTTON_CANCEL,
  CARD_BUTTON_CONFIRM,
  CARD_CALLBACK_BEHAVIOR,
  CARD_SCHEMA_VERSION,
  buildButton,
  buildButtonColumns,
  markdownElement,
} from './card.js';

/** 点选项行回传的 `btn` 值；选中的那一项在 `value` 里。 */
export const OPTION_CARD_PICK = 'pick';

/** 「新建」按钮回传的 `btn` 值（只有带新建的那张卡上有）。 */
export const OPTION_CARD_ADD = 'add';

/** 「确定」按钮的组件名。 */
const CONFIRM_BUTTON_NAME = 'option_confirm';

/** 「新建」按钮的组件名。 */
const ADD_BUTTON_NAME = 'option_add';

/** 「取消」按钮的组件名。 */
const CANCEL_BUTTON_NAME = 'option_cancel';

/**
 * 造一个选项行（`checker`）。
 *
 * @param deps.tag 卡片类型
 * @param deps.requestId 这次请求的身份
 * @param deps.groupIndex 第几组（组件名要在这张卡片里唯一）
 * @param deps.optionIndex 这一组的第几个选项
 * @param deps.group 组 ID
 * @param deps.option 选项 `{ label, description?, value }`
 * @param deps.checked 这一项是不是当前选中的
 * @returns `checker` 元素
 */
function optionRow({ tag, requestId, groupIndex, optionIndex, group, option, checked }) {
  return {
    tag: 'checker',
    name: `option_${groupIndex}_${optionIndex}`,
    checked,
    text: {
      tag: 'lark_md',
      content: option.description ? `**${option.label}**\n${option.description}` : option.label,
    },
    overall_checkable: true,
    padding: '2px 2px 2px 2px',
    behaviors: [{
      type: CARD_CALLBACK_BEHAVIOR,
      value: { tag, btn: OPTION_CARD_PICK, requestId, group, value: option.value },
    }],
  };
}

/**
 * 造卡片体：顶上一行状态 + 若干组（每组一段文字 + 一行一个选项）。
 *
 * @param deps.tag 卡片类型
 * @param deps.requestId 这次请求的身份
 * @param deps.notice 顶上那行状态；空串就不画
 * @param deps.groups 组列表 `[{ id, text, options }]`
 * @param deps.picked `Map`：组 ID → 选中的 `value`
 * @returns 元素列表
 */
function optionElements({ tag, requestId, notice, groups, picked }) {
  const elements = [];
  if (notice) elements.push(markdownElement(notice));

  groups.forEach((group, groupIndex) => {
    if (group.text) elements.push(markdownElement(group.text));
    (group.options ?? []).forEach((option, optionIndex) => {
      elements.push(optionRow({
        tag,
        requestId,
        groupIndex,
        optionIndex,
        group: group.id,
        option,
        checked: picked.get(group.id) === option.value,
      }));
    });
  });

  return elements;
}

/**
 * 造「确定」按钮。
 *
 * @param deps.tag 卡片类型
 * @param deps.requestId 这次请求的身份
 * @param deps.text 按钮文案
 * @param deps.value 当前选中那一项的 `value`
 * @returns 按钮元素
 */
function confirmButton({ tag, requestId, text, value }) {
  return buildButton({
    name: CONFIRM_BUTTON_NAME,
    text,
    type: 'primary',
    value: { tag, btn: CARD_BUTTON_CONFIRM, requestId, value },
  });
}

/**
 * 造「取消」按钮。
 *
 * @param deps.tag 卡片类型
 * @param deps.requestId 这次请求的身份
 * @param deps.text 按钮文案
 * @returns 按钮元素
 */
function cancelButton({ tag, requestId, text }) {
  return buildButton({
    name: CANCEL_BUTTON_NAME,
    text,
    type: 'default',
    value: { tag, btn: CARD_BUTTON_CANCEL, requestId },
  });
}

/**
 * 把卡片体和底部那排按钮包成一张卡片。
 *
 * @param deps.title 卡片标题
 * @param deps.elements 卡片体
 * @param deps.buttons 按钮列表
 * @returns 卡片对象
 */
function optionCard({ title, elements, buttons }) {
  return {
    schema: CARD_SCHEMA_VERSION,
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: title },
    },
    body: { elements: [...elements, buildButtonColumns(buttons)] },
  };
}

/**
 * 造选项卡，底部是「确定 | 取消」。
 *
 * @param deps.tag 卡片类型（回传到 `action.value.tag`）
 * @param deps.requestId 这次请求的身份；选择卡没有身份就传空串
 * @param deps.title 卡片标题
 * @param deps.notice 顶上那行状态；空串就不画
 * @param deps.groups 组列表 `[{ id, text, options }]`——选择卡传一组，反问卡一组一道题
 * @param deps.picked `Map`：组 ID → 选中的 `value`
 * @param deps.confirmText 「确定」按钮文案
 * @param deps.cancelText 「取消」按钮文案
 * @returns 卡片对象
 */
export function buildOptionCard({
  tag, requestId, title, notice, groups, picked, confirmText, cancelText,
}) {
  const pickedValue = groups.length > 0 ? picked.get(groups[0].id) ?? '' : '';
  return optionCard({
    title,
    elements: optionElements({ tag, requestId, notice, groups, picked }),
    buttons: [
      confirmButton({ tag, requestId, text: confirmText, value: pickedValue }),
      cancelButton({ tag, requestId, text: cancelText }),
    ],
  });
}

/**
 * 造选项卡，底部是「确定 | 新建 | 取消」（只有会话列表用）。
 *
 * @param deps.tag 卡片类型
 * @param deps.requestId 这次请求的身份
 * @param deps.title 卡片标题
 * @param deps.notice 顶上那行状态；空串就不画
 * @param deps.groups 组列表 `[{ id, text, options }]`
 * @param deps.picked `Map`：组 ID → 选中的 `value`
 * @param deps.confirmText 「确定」按钮文案
 * @param deps.addText 「新建」按钮文案
 * @param deps.cancelText 「取消」按钮文案
 * @returns 卡片对象
 */
export function buildOptionCardWithAdd({
  tag, requestId, title, notice, groups, picked, confirmText, addText, cancelText,
}) {
  const pickedValue = groups.length > 0 ? picked.get(groups[0].id) ?? '' : '';
  return optionCard({
    title,
    elements: optionElements({ tag, requestId, notice, groups, picked }),
    buttons: [
      confirmButton({ tag, requestId, text: confirmText, value: pickedValue }),
      buildButton({
        name: ADD_BUTTON_NAME,
        text: addText,
        type: 'default',
        value: { tag, btn: OPTION_CARD_ADD, requestId },
      }),
      cancelButton({ tag, requestId, text: cancelText }),
    ],
  });
}
