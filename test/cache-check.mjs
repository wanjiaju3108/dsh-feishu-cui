/** 运行期状态：处理过的消息（上限 200）、在册的卡片（菜单卡一张、回答卡一条消息一张）、配对码（10 分钟）。 */

import { createCheck, libUrl } from './harness.mjs';

const handled = await import(libUrl('cache/handled-messages.js'));
const cards = await import(libUrl('cache/pending-cards.js'));
const pairing = await import(libUrl('cache/pairing.js'));
const codes = await import(libUrl('infra/plugin/pairing-code.js'));

const check = createCheck();

check.eq('没记过的消息就是没处理过', handled.hasHandled('m1'), false);
handled.rememberHandled('m1');
check.eq('记过的消息认得出来', handled.hasHandled('m1'), true);
check.eq('空消息 ID 不记', [handled.rememberHandled(''), handled.hasHandled('')], [undefined, false]);
check.eq('非字符串也不记', [handled.rememberHandled(7), handled.hasHandled(7)], [undefined, false]);

for (let index = 0; index < handled.HANDLED_MESSAGE_LIMIT + 1; index += 1) handled.rememberHandled(`loop-${index}`);
check.eq('记满之后最早那条被忘掉', handled.hasHandled('loop-0'), false);
check.eq('最新那条还认得', handled.hasHandled(`loop-${handled.HANDLED_MESSAGE_LIMIT}`), true);
check.eq('上限就是 200', handled.HANDLED_MESSAGE_LIMIT, 200);

check.eq('没有在册的菜单卡时三项都是空串', cards.readMenuCard(), { tag: '', messageId: '', cancelText: '' });
cards.setMenuCard('sessions', 'om_1', '已取消');
check.eq('记下菜单卡', cards.readMenuCard(), { tag: 'sessions', messageId: 'om_1', cancelText: '已取消' });
cards.setMenuCard('model', 'om_2');
check.eq('新卡顶掉旧卡，没给取消文案就是空串', cards.readMenuCard(), { tag: 'model', messageId: 'om_2', cancelText: '' });
cards.setMenuCard('model', '');
check.eq('消息 ID 为空就当没在册', cards.readMenuCard().messageId, '');
cards.setMenuCard('model', 'om_3');
cards.clearMenuCard();
check.eq('清掉之后又回到没有', cards.readMenuCard().messageId, '');

check.eq('一条回答卡都没写时，账是空的', cards.hasAnswerCard(), false);
cards.writeAnswerCard('om_9', { cardId: 'c1', title: '处理中', content: '正文' });
check.eq('写一张回答卡读得回来', [cards.readAnswerCard('om_9'), cards.hasAnswerCard()], [{ cardId: 'c1', title: '处理中', content: '正文' }, true]);
cards.clearAnswerCard('om_9');
check.eq('清掉之后账又空了', [cards.readAnswerCard('om_9'), cards.hasAnswerCard()], [undefined, false]);

check.eq('配对码有效期是 10 分钟', pairing.PAIRING_CODE_TTL_MS, 600000);
check.eq('没设过码时读出来是空串', pairing.readPairingCode(), '');
pairing.setPairingCode('ABCD2345');
check.eq('设过的码读得回来', pairing.readPairingCode(), 'ABCD2345');

const realNow = Date.now;
let now = realNow();
Date.now = () => now;
pairing.setPairingCode('ABCD2345');
now += pairing.PAIRING_CODE_TTL_MS - 1;
check.eq('没过期就读得出来', pairing.readPairingCode(), 'ABCD2345');
now += 2;
check.eq('过了期读出来是空串', pairing.readPairingCode(), '');
check.eq('过期之后码也被清掉了', pairing.readPairingCode(), '');
now += 1;
pairing.setPairingCode('');
check.eq('设空串等于没有码', pairing.readPairingCode(), '');
Date.now = realNow;

check.eq('生成的码是 8 位', codes.createPairingCode().length, 8);
check.ok('生成的码只用不会看错的字符', Array.from({ length: 200 }, () => codes.createPairingCode())
  .every((code) => new RegExp(`^[${codes.PAIRING_ALPHABET}]{8}$`).test(code)));
check.eq('规范化：去掉空白与连字符、统一大写', codes.normalizePairingText(' ab - 12\tcd '), 'AB12CD');
check.eq('规范化：没给值时是空串', codes.normalizePairingText(undefined), '');

check.finish();
