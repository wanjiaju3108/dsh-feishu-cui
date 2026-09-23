/** 会话目录封装：改名、新建、投喂、中止、撤排队、打开，以及列表的过滤与排序。 */

import { createCheck, createLogger, libUrl } from './harness.mjs';

const { createSessionCatalog } = await import(libUrl('infra/host/session.js'));

const check = createCheck();
const { logger, lines } = createLogger();

/**
 * 造一份假宿主：`controller` 上的方法就是 `sessionController` 上有的那些。
 *
 * @param controller 假会话控制器
 * @param extra 另外要挂的服务（`sessionQuery` 等）
 * @returns `access` 取用口的两个方法
 */
function makeAccess(controller, extra = {}) {
  const services = { sessionController: controller, ...extra };
  return {
    service: (name) => services[name],
    method: (name, methodName) => {
      const live = services[name];
      return live && typeof live[methodName] === 'function' ? live[methodName].bind(live) : undefined;
    },
  };
}

/**
 * 造一条会话记录。
 *
 * @param id 会话 ID
 * @param over 覆盖 header 或投影里的字段
 * @returns 宿主返回的记录
 */
const recordOf = (id, over = {}) => {
  const { cwd = '/a', turns = 1, lastPromptAt = 0, title = `会话 ${id}`, ...rest } = over;
  return {
    header: { id, cwd, createdAt: 1, isSeeded: false, ...rest, projection: { values: { title, sessionStats: { turns }, sessionListMetadata: { lastPromptAt } } } },
  };
};

const workspaces = {
  currentWorkspaceId: () => 'w1',
  list: () => [{ workspaceId: 'w1', sessionIds: ['s1', 's2', 's3', 's4', 's6'] }],
  archivedSessionIds: () => ['s3'],
};
const projectionCache = { cachedSnapshot: (header) => header.projection, cachedPredecessorTitle: () => undefined };

// 改名：宿主收下哪个名字就回哪个
const renameCalls = [];
let renameMode = 'ok';
const catalog = createSessionCatalog({
  logger,
  access: makeAccess({
    rename: async (request) => {
      renameCalls.push(request);
      if (renameMode === 'throw') throw new Error('session/title-invalid: 名字得有点东西');
      return { title: '宿主归一化后的名字', seq: 7 };
    },
    create: async (request) => ({ sessionId: request.workspaceId === 'w1' ? 's9' : 's8' }),
    prompt: async () => {},
    cancel: async () => {},
    resolveAgent: async (sessionId) => (sessionId === 's1' ? { agent: {} } : { error: new Error('没有这个会话') }),
  }, { sessionQuery: { listSessions: async () => [] }, sessionProjectionCache: projectionCache }),
  workspaces,
});

check.eq('改名：回宿主收下的那个名字', await catalog.rename({ sessionId: 's1', title: '  新名字  ' }), { ok: true, title: '宿主归一化后的名字' });
check.eq('改名：把原文交给宿主（归一化是宿主的事）', renameCalls, [{ sessionId: 's1', title: '  新名字  ' }]);

renameMode = 'throw';
const renameFailed = await catalog.rename({ sessionId: 's1', title: '   ' });
check.eq('改名：宿主拒了就是没改成', [renameFailed.ok, renameFailed.error], [false, 'session/title-invalid: 名字得有点东西']);
check.ok('改名失败留下 warn 日志', lines.warn.some((line) => line.includes('session/title-invalid')));

const noController = createSessionCatalog({ logger, access: makeAccess(undefined), workspaces });
check.eq('没有会话控制器：改名、新建、投喂都回没成', [
  (await noController.rename({ sessionId: 's1', title: 'x' })).error,
  await noController.create(),
  (await noController.prompt({ sessionId: 's1', requestId: 'r', mode: 'queue', content: 'hi' })).error,
], ['没有会话控制器', '', '没有会话控制器']);

const createCalls = [];
const creator = createSessionCatalog({
  logger,
  access: makeAccess({ create: async (request) => { createCalls.push(request); return { sessionId: 's9' }; } }),
  workspaces,
});
check.eq('新建：有工作区就带工作区', await creator.create({ cwd: '/a', workspaceId: 'w1' }), 's9');
check.eq('新建：没工作区才退回目录', await creator.create({ cwd: '/a' }), 's9');
check.eq('新建：两样都没有就交空请求', await creator.create(), 's9');
check.eq('新建请求的形状', createCalls, [{ workspaceId: 'w1' }, { cwd: '/a' }, {}]);

const promptCalls = [];
const prompter = createSessionCatalog({
  logger,
  access: makeAccess({
    prompt: async (request, signal) => promptCalls.push({ request, signal }),
    cancel: async () => {},
    updateQueue: async () => {},
  }),
  workspaces,
});
check.eq('投喂：成功', await prompter.prompt({ sessionId: 's1', requestId: 'r1', mode: 'queue', content: '你好' }), { ok: true });
check.eq('投喂：正文包成 text 块', promptCalls[0].request.content, [{ type: 'text', text: '你好' }]);
check.eq('投喂：交给宿主的是队列模式与请求身份', [promptCalls[0].request.mode, promptCalls[0].request.requestId], ['queue', 'r1']);
check.eq('投喂：带的是一个不会中止的信号', promptCalls[0].signal.aborted, false);

const thrower = createSessionCatalog({
  logger,
  access: makeAccess({ prompt: async () => { throw new Error('boom'); }, cancel: async () => { throw new Error('boom'); }, updateQueue: async () => { throw new Error('boom'); } }),
  workspaces,
});
check.eq('投喂：宿主抛错就是没成', await thrower.prompt({ sessionId: 's1', requestId: 'r1', mode: 'queue', content: 'hi' }), { ok: false, error: 'boom' });
check.eq('中止：宿主抛错就是没成', await thrower.cancel({ sessionId: 's1' }), { ok: false, error: 'boom' });

const queueCalls = [];
const queued = createSessionCatalog({
  logger,
  access: makeAccess({ updateQueue: async (request) => queueCalls.push(request) }),
  workspaces,
});
check.eq('撤排队项：成功', await queued.removeQueued({ sessionId: 's1', itemId: 'i1' }), { ok: true });
check.eq('撤排队项请求的形状', queueCalls, [{ sessionId: 's1', itemId: 'i1', action: { kind: 'remove' } }]);

check.eq('打开：控制器上没有 resolveAgent 就是没打开', await creator.open('s1'), false);
const opener = createSessionCatalog({
  logger,
  access: makeAccess({ resolveAgent: async (sessionId) => (sessionId === 's1' ? { agent: {} } : { error: new Error('没有这个会话') }) }),
  workspaces,
});
check.eq('打开：有 agent 就 true', await opener.open('s1'), true);
check.eq('打开：解不出 agent 就 false', await opener.open('s2'), false);
check.ok('打开失败留下 warn 日志', lines.warn.some((line) => line.includes('没有这个会话')));

// 列表：别的会话 / 已归档 / 没跑过的都滤掉，按最近活动倒序
let listCalls = 0;
const lister = createSessionCatalog({
  logger,
  access: makeAccess({}, {
    sessionQuery: {
      listSessions: async () => {
        listCalls += 1;
        return [
          recordOf('s1', { turns: 3, lastPromptAt: 300, title: '甲' }),
          recordOf('s2', { turns: 0, lastPromptAt: 200, title: '没跑过' }),
          recordOf('s3', { turns: 5, lastPromptAt: 500, title: '归档了' }),
          recordOf('s4', { turns: 1, lastPromptAt: 400, title: '乙' }),
          recordOf('s5', { cwd: undefined, turns: 2, lastPromptAt: 600, title: '没有目录' }),
          recordOf('s6', { turns: 2, lastPromptAt: 700, title: '不在这个工作区' }),
        ];
      },
    },
    sessionProjectionCache: projectionCache,
  }),
  workspaces: { ...workspaces, list: () => [{ workspaceId: 'w1', sessionIds: ['s1', 's2', 's3', 's4'] }] },
});
check.eq('列表：滤掉没跑过的与归档的，按最近活动倒序', (await lister.listRecent()).map((session) => session.id), ['s4', 's1']);

listCalls = 0;
check.eq('查名字：第一次要全量找一遍', await lister.titleOf('s1'), '甲');
check.eq('查名字：紧接着再查走缓存', [await lister.titleOf('s1'), listCalls], ['甲', 1]);
check.eq('查目录：同一个会话也走缓存', await lister.cwdOf('s1'), '/a');
check.eq('查不存在的会话：名字是空串', await lister.titleOf('nope'), '');

const noWorkspace = createSessionCatalog({
  logger,
  access: makeAccess({}, { sessionQuery: { listSessions: async () => [recordOf('s1')] }, sessionProjectionCache: projectionCache }),
  workspaces: { currentWorkspaceId: () => '', list: () => [], archivedSessionIds: () => [] },
});
check.eq('认不出当前工作区：列表返回 undefined', await noWorkspace.listRecent(), undefined);
check.ok('认不出当前工作区留下 warn 日志', lines.warn.some((line) => line.includes('没有当前工作区')));

check.finish();
