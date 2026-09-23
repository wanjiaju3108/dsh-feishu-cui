/** 会话目录：列本机的会话（按最近活动倒序）、查一个会话的名字与工作目录、打开会话、新建会话、改名。 */

/** 没有会话控制器时给出的原因（只进日志，不给人看）。 */
const NO_SESSION_CONTROLLER_ERROR = '没有会话控制器';

/** 卡片里最多列几个。 */
const SESSION_LIST_LIMIT = 20;

/** 单个会话摘要缓存多久（毫秒）。 */
const TITLE_CACHE_MS = 30 * 1000;

/** 交给宿主 `sessionController.prompt` 的中止信号，一个不会中止的信号。 */
const NEVER_ABORTED = new AbortController().signal;

/**
 * 建会话目录。
 *
 * @param deps.logger 日志
 * @param deps.access 宿主服务取用口（`infra/host/service-access.js`）
 * @param deps.workspaces 工作区封装（`infra/host/workspace.js` 的 `createWorkspaces`）
 * @returns 会话目录：listRecent / titleOf / cwdOf / open / create / rename / prompt / cancel / removeQueued
 */
export function createSessionCatalog({ logger, access, workspaces }) {
  let cached;

  /**
   * 读会话的标题投影。
   *
   * @param header 会话 header
   * @returns 投影值；读不到时 undefined
   */
  function readProjection(header) {
    const cache = access.service('sessionProjectionCache');
    if (!cache) return undefined;
    try {
      if (header.isSeeded) return undefined;
      const block = cache.cachedSnapshot(header, 0) ?? cache.cachedPredecessorTitle(header, 0);
      return block?.values;
    } catch (error) {
      logger.warn(`读取会话 ${header.id} 的投影失败：${error?.message ?? error}`);
      return undefined;
    }
  }

  /**
   * 把一个会话 header 压成卡片需要的摘要。
   *
   * @param header 会话 header
   * @returns 会话摘要
   */
  function summarize(header) {
    const projection = readProjection(header);
    const turns = projection?.sessionStats?.turns;
    return {
      id: header.id,
      title: typeof projection?.title === 'string' ? projection.title : '',
      cwd: header.cwd ?? '',
      updatedAt: projection?.sessionListMetadata?.lastPromptAt ?? header.createdAt ?? 0,
      turns: typeof turns === 'number' ? turns : undefined,
    };
  }

  /**
   * 本机带工作目录的会话，按最近活动倒序。
   *
   * @returns 会话摘要列表；服务缺席或查询失败时为空数组
   */
  async function all() {
    const engine = access.service('sessionQuery');
    if (!engine) return [];
    try {
      const records = await engine.listSessions();
      return records
        .filter((record) => record?.header?.cwd !== undefined)
        .map((record) => summarize(record.header))
        .sort((left, right) => right.updatedAt - left.updatedAt);
    } catch (error) {
      logger.warn(`列会话失败：${error?.message ?? error}`);
      return [];
    }
  }

  /**
   * 卡片里列的最近会话：当前工作区里、没归档的那几个，截断到 `SESSION_LIST_LIMIT`。
   *
   * @returns 最近的若干会话摘要；认不出当前工作区时 undefined
   */
  async function listRecent() {
    const target = workspaces.currentWorkspaceId();
    const workspace = target ? workspaces.list().find((item) => item.workspaceId === target) : undefined;
    if (!workspace) {
      logger.warn('没有当前工作区，会话列表发不出去');
      return undefined;
    }
    const visible = new Set(workspace.sessionIds);
    for (const archived of workspaces.archivedSessionIds()) visible.delete(archived);
    const sessions = await all();
    return sessions
      .filter((session) => visible.has(session.id) && session.turns !== 0)
      .slice(0, SESSION_LIST_LIMIT);
  }

  /**
   * 查一个会话的摘要：先看缓存，没有再全量找一遍。
   *
   * @param sessionId 会话 ID
   * @returns 会话摘要；查不到时 undefined
   */
  async function find(sessionId) {
    if (!sessionId) return undefined;
    if (cached && cached.id === sessionId && Date.now() - cached.at < TITLE_CACHE_MS) return cached.value;
    const found = (await all()).find((session) => session.id === sessionId);
    cached = found ? { id: sessionId, value: found, at: Date.now() } : undefined;
    return found;
  }

  /**
   * 查一个会话的名字。
   *
   * @param sessionId 会话 ID
   * @returns 会话名；查不到时为空串
   */
  async function titleOf(sessionId) {
    return (await find(sessionId))?.title ?? '';
  }

  /**
   * 查一个会话的工作目录。
   *
   * @param sessionId 会话 ID
   * @returns 工作目录；查不到时为空串
   */
  async function cwdOf(sessionId) {
    return (await find(sessionId))?.cwd ?? '';
  }

  /**
   * 打开（或接管）一个会话，让它有活的 agent。
   *
   * @param sessionId 会话 ID
   * @returns 打开成功时 true
   */
  async function open(sessionId) {
    const resolveAgent = access.method('sessionController', 'resolveAgent');
    if (resolveAgent === undefined) {
      logger.warn('没有会话控制器，无法打开会话');
      return false;
    }
    try {
      const resolved = await resolveAgent(sessionId);
      if (resolved?.error) {
        logger.warn(`打开会话 ${sessionId} 失败：${resolved.error.message ?? resolved.error}`);
        return false;
      }
      logger.info(`会话 ${sessionId} 已打开`);
      return true;
    } catch (error) {
      logger.warn(`打开会话 ${sessionId} 失败：${error?.message ?? error}`);
      return false;
    }
  }

  /**
   * 新建一个会话：有 `workspaceId` 就给工作区，没有才退回 `cwd`。
   *
   * @param deps.cwd 工作目录；为空时用 DSH 的默认目录
   * @param deps.workspaceId 指定的工作区（当前工作区）
   * @returns 新会话 ID；没挂载会话控制器或创建失败时为空串
   */
  async function create({ cwd, workspaceId } = {}) {
    const createSession = access.method('sessionController', 'create');
    if (createSession === undefined) {
      logger.warn('没有会话控制器，无法新建会话');
      return '';
    }
    try {
      const request = workspaceId ? { workspaceId } : cwd ? { cwd } : {};
      const created = await createSession(request);
      return created?.sessionId ?? '';
    } catch (error) {
      logger.warn(`新建会话失败：${error?.message ?? error}`);
      return '';
    }
  }

  /**
   * 给一个会话改名。名字由宿主归一化（去掉转义序列与控制字符、压掉多余空白、按字节数截断），
   * 归一化之后是空的（比如只输了空格）宿主会拒。
   *
   * @param deps.sessionId 会话 ID
   * @param deps.title 用户填的新名字
   * @returns `{ ok: true, title }`（`title` 是宿主收下的那个）或 `{ ok: false, error }`
   */
  async function rename({ sessionId, title }) {
    const call = access.method('sessionController', 'rename');
    if (call === undefined) return { ok: false, error: NO_SESSION_CONTROLLER_ERROR };
    try {
      const accepted = await call({ sessionId, title });
      return { ok: true, title: accepted?.title ?? title };
    } catch (error) {
      logger.warn(`给会话 ${sessionId} 改名失败：${error?.message ?? error}`);
      return { ok: false, error: error?.message ?? String(error) };
    }
  }

  /**
   * 把一句话交给会话。
   *
   * @param deps.sessionId 会话 ID
   * @param deps.requestId 请求身份；宿主写进那条 user message 的 `source.rpcId`，并按它去重
   * @param deps.mode `queue`（等这一轮跑完）或 `steer`（打断当前这一轮）
   * @param deps.content 正文
   * @returns `{ ok: true }` 或 `{ ok: false, error }`
   */
  async function prompt({ sessionId, requestId, mode, content }) {
    const call = access.method('sessionController', 'prompt');
    if (call === undefined) return { ok: false, error: NO_SESSION_CONTROLLER_ERROR };
    try {
      await call({ sessionId, requestId, mode, content: [{ type: 'text', text: content }] }, NEVER_ABORTED);
      return { ok: true };
    } catch (error) {
      logger.warn(`把消息交给会话失败：${error?.message ?? error}`);
      return { ok: false, error: error?.message ?? String(error) };
    }
  }

  /**
   * 中止会话当前这一轮。
   *
   * @param deps.sessionId 会话 ID
   * @returns `{ ok: true }` 或 `{ ok: false, error }`
   */
  async function cancel({ sessionId }) {
    const call = access.method('sessionController', 'cancel');
    if (call === undefined) return { ok: false, error: NO_SESSION_CONTROLLER_ERROR };
    try {
      await call({ sessionId });
      return { ok: true };
    } catch (error) {
      logger.warn(`中止会话失败：${error?.message ?? error}`);
      return { ok: false, error: error?.message ?? String(error) };
    }
  }

  /**
   * 把排队里还没跑的那条撤掉。
   *
   * @param deps.sessionId 会话 ID
   * @param deps.itemId 宿主那条消息的 id
   * @returns `{ ok: true }` 或 `{ ok: false, error }`
   */
  async function removeQueued({ sessionId, itemId }) {
    const call = access.method('sessionController', 'updateQueue');
    if (call === undefined) return { ok: false, error: NO_SESSION_CONTROLLER_ERROR };
    try {
      await call({ sessionId, itemId, action: { kind: 'remove' } });
      return { ok: true };
    } catch (error) {
      logger.warn(`撤回排队的消息失败：${error?.message ?? error}`);
      return { ok: false, error: error?.message ?? String(error) };
    }
  }

  return { listRecent, titleOf, cwdOf, open, create, rename, prompt, cancel, removeQueued };
}
