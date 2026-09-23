/** 判定没通过时的两件事：`code 1` 只记日志，`code 2` 把原因回给用户。 */

import { cardText, createCheck, createLogger, createPush, libUrl, responseCard } from './harness.mjs';

const { createWarnHandler } = await import(libUrl('handler/feishu/warn.js'));
const { clearMenuCard, readMenuCard, setMenuCard } = await import(libUrl('cache/pending-cards.js'));
const { NOT_MATCHED_TEXT, NO_CURRENT_SESSION_TEXT } = await import(libUrl('common/copy.js'));

const check = createCheck();
const { logger, lines } = createLogger();
const { push, sent } = createPush();
const handler = createWarnHandler({ logger, push });

sent.length = 0;
check.eq('code 1：什么都不回', await handler.handle({ code: 1, reason: '消息迟到了 9 秒（m1），丢弃' }, { event: 'message', messageId: 'm1' }), undefined);
check.eq('code 1：一张卡都不发', sent.length, 0);
check.ok('code 1：只留一行 warn 日志', lines.warn.some((line) => line.includes('飞书事件丢弃：消息迟到了')));

await handler.handle({ code: 2, reason: 'not-matched' }, { event: 'message', messageId: 'om_1' });
check.eq('code 2 的消息：回到那条消息上', sent[0].target, { messageId: 'om_1' });
check.eq('code 2：文案按原因查表', cardText(sent[0].card), NOT_MATCHED_TEXT);

sent.length = 0;
await handler.handle({ code: 2, reason: 'no-session' }, { event: 'menu', operatorId: 'ou_1' });
check.eq('code 2 的菜单：发给点菜单的人（没有消息可回）', sent[0].target, { openId: 'ou_1' });
check.eq('code 2：另一个原因对应另一句话', cardText(sent[0].card), NO_CURRENT_SESSION_TEXT);

setMenuCard('sessions', 'om_2', '已取消');
sent.length = 0;
const replaced = await handler.handle({ code: 2, reason: 'session-switch-busy' }, { event: 'card', messageId: 'om_2' });
check.eq('code 2 的卡片：就地换成一句话', cardText(responseCard(replaced)), '有正在进行的任务，无法切换会话');
check.eq('code 2 的卡片：换掉之后不在册了', readMenuCard().messageId, '');
check.eq('code 2 的卡片：不再另外发卡', sent.length, 0);

setMenuCard('sessions', 'om_3', '已取消');
const other = await handler.handle({ code: 2, reason: 'not-matched' }, { event: 'card', messageId: 'om_2' });
check.eq('code 2 的卡片：不是那张在册的卡，就不动在册的它', [readMenuCard().messageId, cardText(responseCard(other))], ['om_3', NOT_MATCHED_TEXT]);
clearMenuCard();

sent.length = 0;
await handler.handle({ code: 2, reason: '这是没配过的新原因' }, { event: 'menu', operatorId: 'ou_1' });
check.eq('没配过的新原因：原样回出去', cardText(sent[0].card), '这是没配过的新原因');

check.finish();
