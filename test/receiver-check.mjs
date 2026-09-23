/** 飞书事件接收层：原始事件转成 CUI 事件（正文、时刻、操作者、卡片表单），再判一次交给下游。 */

import { createCheck, createLogger, libUrl } from './harness.mjs';

const { createReceiver } = await import(libUrl('driving/feishu/receiver.js'));

const check = createCheck();
const { logger, lines } = createLogger();

let seen;
let verdict = { code: 0 };
let downstream;
const admission = {
  admitMessage: (cuiEvent) => (seen = cuiEvent, verdict),
  admitMenu: (cuiEvent) => (seen = cuiEvent, verdict),
  admitCard: (cuiEvent) => (seen = cuiEvent, verdict),
};
const onEvent = createReceiver({
  logger,
  admission,
  onVerdict: async (gotVerdict, cuiEvent) => {
    downstream = { gotVerdict, cuiEvent };
    return '给飞书的回执';
  },
});

/** 一条文本私聊消息。 */
const messagePayload = (over = {}) => ({
  message: { message_type: 'text', content: JSON.stringify({ text: '  你好  ' }), message_id: 'om_1', create_time: '1735689600000' },
  sender: { sender_id: { open_id: 'ou_1' } },
  ...over,
});

check.eq('文本消息转出来的 CUI 事件', seen, undefined);
check.eq('下游拿到回执就原样透出', await onEvent('im.message.receive_v1', messagePayload()), '给飞书的回执');
check.eq('事件名与正文（去掉首尾空白）', [seen.event, seen.tag, seen.content], ['message', 'message', '你好']);
check.eq('消息 ID 与操作者', [seen.messageId, seen.operatorId], ['om_1', 'ou_1']);
check.eq('时刻：13 位就当毫秒', seen.time, 1735689600000);
check.eq('判定和事件一起交给下游', [downstream.gotVerdict, downstream.cuiEvent.event], [{ code: 0 }, 'message']);

await onEvent('im.message.receive_v1', messagePayload({ message: { message_type: 'text', content: JSON.stringify({ text: 'hi' }), message_id: 'om_2', create_time: '1735689600' } }));
check.eq('时刻：10 位按秒乘 1000', seen.time, 1735689600000);

await onEvent('im.message.receive_v1', messagePayload({ message: { message_type: 'text', content: JSON.stringify({ text: 'hi' }), message_id: 'om_3', create_time: '1735689600000000' } }));
check.eq('时刻：16 位按微秒除以 1000', seen.time, 1735689600000);

await onEvent('im.message.receive_v1', messagePayload({ message: { message_type: 'image', content: JSON.stringify({ image_key: 'x' }), message_id: 'om_4' } }));
check.eq('图片消息的正文是空串', seen.content, '');

await onEvent('im.message.receive_v1', messagePayload({ message: { message_type: 'text', content: '不是 JSON', message_id: 'om_5' } }));
check.eq('正文解不出来时是空串', seen.content, '');

await onEvent('application.bot.menu_v6', { event_key: 'session-rename', operator: { operator_id: { open_id: 'ou_1' } }, create_time: 1735689600000 });
check.eq('菜单事件：事件名与 tag 都是 event_key', [seen.event, seen.tag], ['menu', 'session-rename']);
check.eq('菜单事件：没有消息 ID，内容为空', [seen.messageId, seen.content], ['', '']);

await onEvent('card.action.trigger', {
  context: { open_message_id: 'om_6' },
  operator: { open_id: 'ou_1' },
  action: { value: JSON.stringify({ tag: 'session-rename', btn: 'confirm' }), form_value: { input: '新名字' }, checked: true },
  create_time: 1735689600000,
});
check.eq('卡片回调：tag 取自回传的 value', seen.tag, 'session-rename');
check.eq('卡片回调：按钮、表单值、勾选状态都在 content 里', seen.content, { value: { tag: 'session-rename', btn: 'confirm' }, formValue: { input: '新名字' }, checked: true });
check.eq('卡片回调：消息 ID 与操作者', [seen.messageId, seen.operatorId], ['om_6', 'ou_1']);

await onEvent('card.action.trigger', {
  context: { open_message_id: 'om_7' },
  operator: { open_id: 'ou_1' },
  action: { value: { tag: 'sessions', btn: 'pick', value: 's2' } },
});
check.eq('卡片回调：value 本来就是对象也认', seen.content.value, { tag: 'sessions', btn: 'pick', value: 's2' });
check.eq('卡片回调：没有表单值时是空对象', seen.content.formValue, {});

downstream = undefined;
check.eq('不认识的事件类型：不往下走', await onEvent('im.chat.updated_v1', {}), undefined);
check.eq('不认识的事件类型：下游没被调用', downstream, undefined);

verdict = { code: 2, reason: 'not-matched' };
check.eq('判定没通过也照样交给下游（回话是下游的事）', await onEvent('application.bot.menu_v6', { event_key: 'balance' }), '给飞书的回执');

let broken;
const brokenReceiver = createReceiver({
  logger,
  admission: { admitMessage: () => { throw new Error('判定炸了'); } },
  onVerdict: async () => { broken = true; },
});
check.eq('下游或判定抛错时不往外炸', await brokenReceiver('im.message.receive_v1', messagePayload()), undefined);
check.eq('下游或判定抛错时下游没被调用', broken, undefined);
check.ok('抛错留下了 error 日志', lines.error.some((line) => line.includes('判定炸了')));

check.finish();
