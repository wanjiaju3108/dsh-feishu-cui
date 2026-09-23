/** 飞书事件的接收层：收飞书推来的原始事件，转成 CUI 事件，判一次，把结果和事件一起交给下游。 */

import {
  CARD_ACTION_EVENT_TYPE,
  MENU_EVENT_TYPE,
  MESSAGE_RECEIVE_EVENT_TYPE,
} from '../../common/feishu-event.js';
import { createCuiEvent } from '../../common/cui-event-schema.js';

/** 飞书文本消息的 `message_type` 取值。 */
const TEXT_MESSAGE_TYPE = 'text';

/**
 * 取飞书文本消息的正文。
 *
 * @param message 飞书消息对象
 * @returns 去掉首尾空白的正文；不是文本消息或解析失败时返回空串
 */
function readMessageText(message) {
  if (message?.message_type !== TEXT_MESSAGE_TYPE) return '';
  try {
    return (JSON.parse(message.content ?? '{}').text ?? '').trim();
  } catch {
    return '';
  }
}

/**
 * 取事件的发生时刻（毫秒时间戳）。
 *
 * @param event 飞书事件
 * @returns 毫秒时间戳；没有或认不出时 undefined
 */
function readEventTimeMs(event) {
  const value = Number(event?.message?.create_time ?? event?.create_time);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  switch (String(Math.trunc(value)).length) {
    case 10: return value * 1000;
    case 13: return value;
    case 16: return Math.round(value / 1000);
    default: return undefined;
  }
}

/**
 * 取卡片按钮回传的参数。
 *
 * @param event 飞书卡片回调事件
 * @returns 解析出的参数对象；取不到时 undefined
 */
function readCardActionValue(event) {
  const value = event?.action?.value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return typeof value === 'object' && value !== null ? value : undefined;
}

/**
 * 读一次卡片回调的动作、卡片所在消息、以及整个表单的值。
 *
 * @param event 飞书卡片回调事件
 * @returns `{ action, messageId, formValue, value, checked }`
 */
function readCardActionForm(event) {
  const value = readCardActionValue(event);
  return {
    action: typeof value?.action === 'string' ? value.action : '',
    messageId: event?.context?.open_message_id ?? '',
    formValue: event?.action?.form_value ?? {},
    value: value ?? {},
    checked: typeof event?.action?.checked === 'boolean' ? event.action.checked : undefined,
  };
}

/** 我们自己的事件取值：消息。 */
const MESSAGE = 'message';
/** 我们自己的事件取值：菜单。 */
const MENU = 'menu';
/** 我们自己的事件取值：卡片。 */
const CARD = 'card';

/**
 * 把飞书原始事件转成 CUI 事件。
 *
 * @param type 飞书事件类型
 * @param payload 飞书原始事件
 * @returns CUI 事件
 */
function toCuiEvent(type, payload) {
  if (type === MESSAGE_RECEIVE_EVENT_TYPE) {
    return createCuiEvent({
      event: MESSAGE,
      tag: MESSAGE,
      time: readEventTimeMs(payload),
      content: readMessageText(payload?.message),
      messageId: payload?.message?.message_id ?? '',
      operatorId: payload?.sender?.sender_id?.open_id ?? '',
    });
  }

  if (type === MENU_EVENT_TYPE) {
    return createCuiEvent({
      event: MENU,
      tag: payload?.event_key ?? '',
      time: readEventTimeMs(payload),
      content: '',
      messageId: '',
      operatorId: payload?.operator?.operator_id?.open_id ?? '',
    });
  }

  const { formValue, value, checked } = readCardActionForm(payload);
  return createCuiEvent({
    event: CARD,
    tag: value?.tag ?? '',
    time: readEventTimeMs(payload),
    content: { value, formValue, checked },
    messageId: payload?.context?.open_message_id ?? '',
    operatorId: payload?.operator?.open_id ?? '',
  });
}

/**
 * 建一个飞书事件接收器。
 *
 * @param deps.logger 日志
 * @param deps.admission 准入判定（`createAdmission` 的返回值：三个方法，各自返回带 `code` 的判定）
 * @param deps.onVerdict 判定和事件往哪送：`(verdict, cuiEvent) => any`，返回值会原样回到飞书
 * @returns 收事件用的函数：`(type, payload) => any`，交给 `transport.start({ onEvent })`
 */
export function createReceiver({ logger, admission, onVerdict }) {
  /** 哪个事件名交给哪个判定方法——这就是"我们要收哪三类"。 */
  const HANDLERS = {
    [MESSAGE_RECEIVE_EVENT_TYPE]: admission.admitMessage,
    [MENU_EVENT_TYPE]: admission.admitMenu,
    [CARD_ACTION_EVENT_TYPE]: admission.admitCard,
  };

  /**
   * 转一下、判一下，把 `code` 和事件一起交给下游。
   *
   * @param type 事件类型
   * @param payload 飞书原始事件
   * @returns 下游的返回值，原样透出；没通过或出异常时 undefined
   */
  return async function onEvent(type, payload) {
    const admit = HANDLERS[type];
    if (admit === undefined) return undefined;
    try {
      const cuiEvent = toCuiEvent(type, payload);
      const verdict = admit(cuiEvent);
      return await onVerdict(verdict, cuiEvent);
    } catch (error) {
      logger.error(`处理 ${type} 事件失败：${error?.stack ?? error?.message ?? error}`);
      return undefined;
    }
  };
}
