/** 设置页那三条路由：只服务本机回环、入参出参都走 JSON，出错回机器标记。 */

import { callRoute, cardText, createCheck, libUrl, registry, resetCalls, sentCards, startPlugin, tick } from './harness.mjs';

const { CREDENTIALS_ROUTE, SETTINGS_BASE_PATH, SLEEP_GUARD_ROUTE, STATE_ROUTE, UNBIND_USER_ROUTE } = await import(libUrl('settings/routes.js'));
const { UNBOUND_TEXT, UNBOUND_TITLE } = await import(libUrl('common/copy.js'));
const { setPairingCode } = await import(libUrl('cache/pairing.js'));

const check = createCheck();
const app = await startPlugin();
await tick(30);

const route = (path) => app.routes.find((item) => item.path === path);

check.eq('挂的是四条精确路由', app.routes.map((item) => [item.kind, item.path]), [
  ['exact', STATE_ROUTE], ['exact', CREDENTIALS_ROUTE], ['exact', UNBIND_USER_ROUTE], ['exact', SLEEP_GUARD_ROUTE],
]);
check.ok('路径都挂在插件自己的前缀下', app.routes.every((item) => item.path.startsWith(SETTINGS_BASE_PATH)));

const snapshot = await callRoute(route(STATE_ROUTE), { method: 'GET' });
check.eq('读状态：200', snapshot.status, 200);
check.eq('读状态：回的是 JSON', snapshot.headers['content-type'], 'application/json; charset=utf-8');
check.eq('快照里的字段', Object.keys(snapshot.json).sort(), [
  'appIdConfigured', 'appIdWritable', 'appSecretConfigured', 'appSecretWritable', 'connected', 'pairingCode',
  'sleepGuard', 'userId',
].sort());
check.eq('没有在册的配对码时回 null', snapshot.json.pairingCode, null);

setPairingCode('ABCD2345');
check.eq('在册的配对码出现在快照里', (await callRoute(route(STATE_ROUTE), { method: 'GET' })).json.pairingCode, 'ABCD2345');

const outside = await callRoute(route(STATE_ROUTE), { method: 'GET', remoteAddress: '10.1.2.3' });
check.eq('不是本机来的：403 + 机器标记', [outside.status, outside.json], [403, { error: 'loopback-only' }]);

const wrongMethod = await callRoute(route(STATE_ROUTE), { method: 'POST' });
check.eq('方法不对：405 + 说明允许哪个方法', [wrongMethod.status, wrongMethod.json], [405, { error: 'method-only', method: 'GET' }]);
check.eq('方法不对时也写了 allow 头', wrongMethod.headers.allow, 'GET');

const brokenJson = await callRoute(route(CREDENTIALS_ROUTE), { raw: '{不是 JSON' });
check.eq('请求体不是 JSON：400 + 机器标记', [brokenJson.status, brokenJson.json], [400, { error: 'body-not-json' }]);

const tooLarge = await callRoute(route(CREDENTIALS_ROUTE), { raw: JSON.stringify({ appId: 'x'.repeat(40 * 1024) }) });
check.eq('请求体过大：400 + 机器标记', [tooLarge.status, tooLarge.json], [400, { error: 'body-too-large' }]);

resetCalls();
const blank = await callRoute(route(CREDENTIALS_ROUTE), { body: { appId: '', appSecret: '' } });
await tick(30);
check.eq('空字符串不覆盖已有凭据', app.credentials(), { FEISHU_CUI_APP_ID: 'cli_stub', FEISHU_CUI_APP_SECRET: 'secret_stub' });
check.eq('提交凭据就重置一次连接（哪怕一个字没改）', [
  blank.status,
  registry.calls.filter((call) => call.kind === 'ws.close').length,
  registry.calls.filter((call) => call.kind === 'ws.start').length,
], [200, 1, 1]);

resetCalls();
const unbound = await callRoute(route(UNBIND_USER_ROUTE), { body: {} });
await tick(30);
check.eq('解绑：快照里的 userId 空了', unbound.json.userId, '');
check.eq('解绑：在册的配对码一并作废', unbound.json.pairingCode, null);
check.eq('解绑之后内存里的设置也清了', app.settings.read().userId, '');
check.ok('给原 owner 发了解绑卡', cardText(sentCards().at(-1)).includes(UNBOUND_TITLE) && cardText(sentCards().at(-1)).includes(UNBOUND_TEXT));

check.finish();
