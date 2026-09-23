/** 配对：发码、已绑定、填对、填错、没有在册的码、取消。 */

import { cardText, createCheck, createPush, installSettings, libUrl, responseCard } from './harness.mjs';

const { createPairingHandler } = await import(libUrl('handler/feishu/pairing.js'));
const { clearPairingCode, readPairingCode, setPairingCode } = await import(libUrl('cache/pairing.js'));
const { readMenuCard } = await import(libUrl('cache/pending-cards.js'));
const { PAIRING_ALREADY_BOUND_TEXT, PAIRING_CANCELLED_TEXT, PAIRING_CODE_EXPIRED_TEXT, PAIRING_CODE_WRONG_TEXT, PAIRING_SUCCESS_TEXT } = await import(libUrl('common/copy.js'));

const check = createCheck();
const settings = await installSettings({ sessionId: 's1', userId: '' });
const { push, sent } = createPush();
const handler = createPairingHandler({ logger: { info: () => {}, warn: () => {} }, push });

/** 造一次卡片回调。 */
const cardEvent = (over = {}) => ({
  messageId: readMenuCard().messageId,
  operatorId: 'u1',
  content: { value: { tag: 'pairing', btn: 'confirm' }, formValue: { input: 'x' } },
  ...over,
});

await handler.pushPairingCode({ operatorId: 'u1' });
const issued = readPairingCode();
check.eq('点菜单发出一张输入框卡片', [sent.length, sent[0].target.openId], [1, 'u1']);
check.ok('卡片类型是 pairing', JSON.stringify(sent[0].card).includes('"pairing"'));
check.eq('生成了 8 位配对码', issued.length, 8);
check.ok('配对码只用不会看错的字符', /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(issued));

const success = await handler.verifyPairingCode(cardEvent({
  content: { value: { tag: 'pairing', btn: 'confirm' }, formValue: { input: ` ${issued.toLowerCase()} ` } },
}));
check.eq('填对（大小写、空格都不计较）：记下这个 user', [cardText(responseCard(success)), settings.read().userId], [PAIRING_SUCCESS_TEXT, 'u1']);
check.eq('用过就作废', readPairingCode(), '');
check.eq('配对成功之后卡片不在册了', readMenuCard().messageId, '');

await handler.pushPairingCode({ operatorId: 'u1' });
check.eq('已经绑过：只回一句不发卡片', cardText(sent[sent.length - 1].card), PAIRING_ALREADY_BOUND_TEXT);
check.ok('已经绑过时不发输入框卡片', !JSON.stringify(sent[sent.length - 1].card).includes('"input"'));

settings.set({ userId: '' });
await handler.pushPairingCode({ operatorId: 'u1' });
setPairingCode('ABCD2345');
const wrong = await handler.verifyPairingCode(cardEvent({
  content: { value: { tag: 'pairing', btn: 'confirm' }, formValue: { input: 'ABCD2346' } },
}));
check.eq('填错：回码不对，也没记下 user', [cardText(responseCard(wrong)), settings.read().userId], [PAIRING_CODE_WRONG_TEXT, '']);

await handler.pushPairingCode({ operatorId: 'u1' });
clearPairingCode();
const expired = await handler.verifyPairingCode(cardEvent({
  content: { value: { tag: 'pairing', btn: 'confirm' }, formValue: { input: 'ABCD2345' } },
}));
check.eq('没有在册的码（过期 / 用过）：让人重新申请', cardText(responseCard(expired)), PAIRING_CODE_EXPIRED_TEXT);

setPairingCode('ABCD2345');
const cancelled = await handler.verifyPairingCode(cardEvent({ content: { value: { tag: 'pairing', btn: 'cancel' } } }));
check.eq('点取消：回取消那句', cardText(responseCard(cancelled)), PAIRING_CANCELLED_TEXT);
check.eq('点取消：在册的码一起作废', readPairingCode(), '');

check.finish();
