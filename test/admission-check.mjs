/** 入站准入：去重、迟到、鉴权、只认文本、有没有当前会话，以及"有活没干完"时挡不挡。 */

import { createCheck, installSettings, libUrl } from './harness.mjs';

const { createAdmission } = await import(libUrl('driving/feishu/admission.js'));
const { clearAnswerCard, writeAnswerCard } = await import(libUrl('cache/pending-cards.js'));

const check = createCheck();
const settings = await installSettings({ sessionId: 's1', userId: 'u1' });
const admission = createAdmission({ readSettings: () => settings.read() });

/**
 * 造一条私聊消息。
 *
 * @param over 覆盖哪几个字段
 * @returns CUI 事件
 */
const message = (over = {}) => ({ messageId: 'm1', time: Date.now(), content: '你好', operatorId: 'u1', ...over });

check.eq('本人发的文本消息放行', admission.admitMessage(message()), { code: 0 });
check.eq('同一条飞书消息再投一次，丢掉', admission.admitMessage(message()), { code: 1, reason: '同一条飞书消息又投递了一次（m1），忽略' });
check.eq('迟到超过 3 秒的丢掉', admission.admitMessage(message({ messageId: 'm2', time: Date.now() - 5000 })).code, 1);
check.eq('不是本人，回同一句不给过', admission.admitMessage(message({ messageId: 'm3', operatorId: 'u2' })), { code: 2, reason: 'not-matched' });
check.eq('不是文本消息，不给过', admission.admitMessage(message({ messageId: 'm4', content: '' })), { code: 2, reason: 'unsupported-message' });

settings.set({ sessionId: '' });
check.eq('还没有当前会话，不给过', admission.admitMessage(message({ messageId: 'm5' })), { code: 2, reason: 'no-session' });
settings.set({ sessionId: 's1' });

check.eq('本人点菜单放行', admission.admitMenu({ tag: 'balance', operatorId: 'u1' }), { code: 0 });
check.eq('别的菜单项，没绑定时只回同一句', admission.admitMenu({ tag: 'balance', operatorId: 'u9' }), { code: 2, reason: 'not-matched' });

writeAnswerCard('r1', { cardId: 'c1', title: '处理中', content: '' });
check.eq('有回答卡在册时，不让切会话', admission.admitMenu({ tag: 'sessions', operatorId: 'u1' }), { code: 2, reason: 'session-switch-busy' });
check.eq('有回答卡在册时，不让换工作区', admission.admitCard({ tag: 'workspaces', operatorId: 'u1', content: { value: { btn: 'confirm' } } }), { code: 2, reason: 'workspace-switch-busy' });
check.eq('有回答卡在册时，改会话名照旧放行（不换当前会话）', admission.admitMenu({ tag: 'session-rename', operatorId: 'u1' }), { code: 0 });
check.eq('点「取消」不算切换，不挡', admission.admitCard({ tag: 'sessions', operatorId: 'u1', content: { value: { btn: 'cancel' } } }), { code: 0 });
clearAnswerCard('r1');

check.eq('本人点卡片放行', admission.admitCard({ tag: 'sessions', operatorId: 'u1', content: {} }), { code: 0 });
check.eq('不是本人点卡片，回同一句', admission.admitCard({ tag: 'sessions', operatorId: 'u2', content: {} }), { code: 2, reason: 'not-matched' });

settings.set({ userId: '' });
check.eq('没绑定时，配对菜单放行', admission.admitMenu({ tag: 'pairing', operatorId: 'u9' }), { code: 0 });
check.eq('没绑定时，非配对的卡片回调回同一句', admission.admitCard({ tag: 'sessions', operatorId: 'u1', content: {} }), { code: 2, reason: 'not-matched' });
check.eq('没绑定时，配对的卡片回调放行', admission.admitCard({ tag: 'pairing', operatorId: 'u1', content: {} }), { code: 0 });

check.finish();
