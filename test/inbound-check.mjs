/** 入站端到端：飞书消息与菜单进来 → 判定 → 卡片 / 交给会话。 */

import {
  cardText, createCheck, libUrl, registry, resetCalls, sentCards, sessionRecord, startPlugin, tick,
} from './harness.mjs';

const {
  NOT_MATCHED_TEXT, NO_CURRENT_SESSION_TEXT, PAIRING_SUCCESS_TEXT, SESSION_CARD_TITLE, UNSUPPORTED_MESSAGE_TEXT,
} = await import(libUrl('common/copy.js'));
const { PAIRING_KEY } = await import(libUrl('handler/feishu/pairing.js'));
const { SESSION_LIST_KEY } = await import(libUrl('handler/feishu/sessions.js'));
const { readPairingCode } = await import(libUrl('cache/pairing.js'));

const check = createCheck();
// 启动时会校验「配置的当前会话在不在列表里」，不在就按「没有当前会话」处理；夹具里得让它在。
const app = await startPlugin({
  sessionId: 'sess-1',
  userId: '',
  sessionRecords: [sessionRecord({ id: 'sess-1', title: '会话一', turns: 3 })],
});
await tick(30);

/** 最近一张发出去的卡片。 */
const lastCard = () => sentCards().at(-1);

await app.incoming({ messageId: 'om_1', text: '你好', openId: 'ou_stranger' });
check.eq('没绑定时发消息：只回同一句', cardText(lastCard()), NOT_MATCHED_TEXT);
check.eq('没绑定时不把消息交给会话', app.calls.prompt.length, 0);
check.eq('回的是那条消息', registry.calls.at(-1).targetMessageId, 'om_1');

resetCalls();
await app.menu(PAIRING_KEY, { openId: 'ou_boss' });
const pairingCardId = registry.calls.at(-1).messageId;
check.ok('点「申请配对」发出一张输入框卡片', JSON.stringify(lastCard()).includes('"input"'));

const issued = readPairingCode();
check.eq('菜单点击现铸了一个 8 位配对码', issued.length, 8);
const paired = await app.cardAction(
  { tag: PAIRING_KEY, btn: 'confirm' },
  { openId: 'ou_boss', messageId: pairingCardId, formValue: { input: ` ${issued.toLowerCase()} ` } },
);
check.eq('填对码：卡片换成「配对成功」', cardText(paired.card.data), PAIRING_SUCCESS_TEXT);
check.eq('填对码：这个人被记成绑定的 user', app.settings.read().userId, 'ou_boss');

resetCalls();
await app.incoming({ messageId: 'om_2', text: '帮我看下这个报错' });
check.eq('消息按当前会话交出去（正文包成 text 块、请求身份是飞书消息 ID）', app.calls.prompt, [{
  sessionId: 'sess-1', requestId: 'om_2', mode: 'queue', content: [{ type: 'text', text: '帮我看下这个报错' }],
}]);
check.eq('交给会话时不自己回卡', sentCards(), []);

await app.incoming({ messageId: 'om_2', text: '帮我看下这个报错' });
check.eq('同一条消息重投不答两遍', app.calls.prompt.length, 1);

resetCalls();
await app.incoming({ messageId: 'om_3', messageType: 'image', content: JSON.stringify({ image_key: 'img_1' }) });
check.eq('图片消息：回「只支持文本消息」', cardText(lastCard()), UNSUPPORTED_MESSAGE_TEXT);

resetCalls();
await app.incoming({ messageId: 'om_4', text: '你好', openId: 'ou_stranger' });
check.eq('别人发消息：回同一句', cardText(lastCard()), NOT_MATCHED_TEXT);

resetCalls();
const promptCountBefore = app.calls.prompt.length;
app.settings.set({ sessionId: '' });
await app.incoming({ messageId: 'om_5', text: '你好' });
check.eq('还没有当前会话：回一句', cardText(lastCard()), NO_CURRENT_SESSION_TEXT);
check.eq('没有当前会话时不交给会话', app.calls.prompt.length, promptCountBefore);

resetCalls();
app.settings.set({ sessionId: 'sess-1', workspaceId: 'ws-1' });
app.services.sessionQuery.listSessions = async () => [sessionRecord({ id: 'sess-1', title: '会话一', turns: 3 })];
await app.menu(SESSION_LIST_KEY);
check.ok('点「会话列表」发出选项卡', JSON.stringify(lastCard()).includes(`"${SESSION_LIST_KEY}"`));
check.ok('卡片标题是「选择会话」', cardText(lastCard()).includes(SESSION_CARD_TITLE));
check.ok('卡片里列出了宿主给的会话', JSON.stringify(lastCard()).includes('sess-1') && cardText(lastCard()).includes('会话一'));

check.finish();
