/** dsh-feishu-cui 宿主半边入口：拿宿主服务、把各层串起来，再按凭据把飞书长连接启起来。 */

import { APP_ID_REF, APP_SECRET_REF } from './common/credential-refs.js';

import { clearPairingCode } from './cache/pairing.js';
import { createAdmission } from './driving/feishu/admission.js';
import { createReceiver } from './driving/feishu/receiver.js';
import { createRouter } from './driving/feishu/router.js';
import { createAdmission as createHostAdmission } from './driving/host/admission.js';
import { createReceiver as createHostReceiver } from './driving/host/receiver.js';
import { createRouter as createHostRouter } from './driving/host/router.js';
import { createBalanceHandler } from './handler/feishu/balance.js';
import { createEffortHandler } from './handler/feishu/effort.js';
import { createModelHandler } from './handler/feishu/model.js';
import { createPermissionHandler } from './handler/feishu/permission.js';
import { createPairingHandler } from './handler/feishu/pairing.js';
import { createMessageHandler } from './handler/feishu/message.js';
import { createSessionsHandler } from './handler/feishu/sessions.js';
import { createWorkspacesHandler } from './handler/feishu/workspaces.js';
import { createWarnHandler } from './handler/feishu/warn.js';
import { createPush } from './infra/feishu/push.js';
import { createBalanceReader } from './infra/host/balance.js';
import { createModelCatalog } from './infra/host/models.js';
import { createPermissions } from './infra/host/permissions.js';
import { createServiceAccess } from './infra/host/service-access.js';
import { createSessionCatalog } from './infra/host/session.js';
import { createWorkspaces } from './infra/host/workspace.js';
import { readSettings, registerSettings, writeSettings } from './infra/plugin/config.js';
import { createCredentialStore } from './infra/plugin/credentials.js';
import { registerLogExporter } from './infra/plugin/log-exporter.js';
import { sendConnectedNotice, sendUnboundNotice } from './init.js';
import { createSettingsPanel } from './settings/panel.js';
import { createAnswer } from './handler/host/answer.js';
import { APPROVAL_REQUEST_EVENT, createApprovalHandler } from './handler/host/approval.js';
import { USER_QUESTIONS_EVENT, createQuestionHandler } from './handler/host/question.js';
import { createSettingsWatch } from './handler/host/settings-watch.js';
import { createSessionEventsTransport } from './transport/host/session-events.js';
import { createAgentEventsTransport } from './transport/host/agent-events.js';
import { createWaterfallTransport } from './transport/host/waterfall.js';
import { createTransport } from './transport/feishu/transport.js';

/** 插件名。 */
export const PLUGIN_NAME = 'dsh-feishu-cui';

/** 需要注入的宿主服务名列表。 */
export const INJECT = ['credentials', 'settings', 'webServer', 'sessionController'];

/** loader 条目名。 */
export const name = PLUGIN_NAME;

/** 插件声明的依赖：凭据存储 + 普通设置 + Web 服务器 + 会话控制器。 */
export const inject = INJECT;

/**
 * 插件入口。
 *
 * @param ctx Cordis 上下文
 */
export async function apply(ctx) {
  const logger = ctx.logger('feishu-cui');
  registerLogExporter(ctx);

  registerSettings({ settings: ctx.get('settings'), logger });

  const store = createCredentialStore({ credentials: ctx.get('credentials'), logger });

  const transport = createTransport({ logger });

  const push = createPush({ logger, client: () => transport.rest() });

  const pairing = createPairingHandler({ logger, push });
  const balanceReader = createBalanceReader({ logger, credentials: ctx.get('credentials') });
  const balance = createBalanceHandler({ logger, push, balance: balanceReader });
  const workspaces = createWorkspaces({ ctx, logger });
  const access = createServiceAccess({ ctx, logger });
  const catalog = createSessionCatalog({ ctx, logger, access, workspaces });
  const sessions = createSessionsHandler({ logger, push, catalog });
  const workspaceCards = createWorkspacesHandler({ logger, push, workspaces });
  const message = createMessageHandler({ logger, push, catalog });
  const sessionEvents = createSessionEventsTransport({ ctx, logger });
  const agentEvents = createAgentEventsTransport({ ctx, logger });
  const userQuestions = createWaterfallTransport({ ctx, logger, event: USER_QUESTIONS_EVENT });
  const approvals = createWaterfallTransport({ ctx, logger, event: APPROVAL_REQUEST_EVENT });
  const hostAdmission = createHostAdmission({ readSettings });
  const answer = createAnswer({ logger, push, catalog });
  const question = createQuestionHandler({ logger, push });
  const approval = createApprovalHandler({ logger, push });
  const models = createModelCatalog({ ctx, logger, access });
  const permissions = createPermissions({ ctx, logger, access });
  const settingsWatch = createSettingsWatch({ logger, push, models, permissions });
  const hostRouter = createHostRouter({ answer, settingsWatch });
  const hostReceiver = createHostReceiver({ logger, admission: hostAdmission, onVerdict: hostRouter.route });
  const model = createModelHandler({ logger, push, models });
  const effort = createEffortHandler({ logger, push, models });
  const permission = createPermissionHandler({ logger, push, permissions });
  const warn = createWarnHandler({ logger, push });
  const router = createRouter({
    logger, pairing, balance, sessions, workspaces: workspaceCards, model, effort, permission, message, answer,
    question, approval, warn,
  });
  const admission = createAdmission({ readSettings });
  const onEvent = createReceiver({ logger, admission, onVerdict: router.route });

  /**
   * 读凭据。
   *
   * @returns `{ appId, appSecret }`
   */
  async function readCredentials() {
    const [appId, appSecret] = await Promise.all([
      store.read(APP_ID_REF),
      store.read(APP_SECRET_REF),
    ]);
    return { appId, appSecret };
  }

  /**
   * 连上之后给绑定的那个人发一张卡：告诉他连上了、当前会话是哪个。
   */
  async function announceConnected() {
    const { sessionId } = readSettings();
    const title = sessionId ? await catalog.titleOf(sessionId) : '';
    try {
      await sendConnectedNotice({ logger, push, sessionId, title });
    } catch (error) {
      logger.warn(`连接通告没发出去：${error?.message ?? error}`);
    }
  }

  /**
   * 连接状态变化：记一行日志；连上就补一次通告。
   *
   * @param status `{ connected, error }`
   */
  function onStatus(status) {
    if (status.connected) {
      logger.info('飞书长连接已建立');
      void announceConnected();
      return;
    }
    logger.warn(`飞书长连接断开：${status.error ?? '(没有错误信息)'}`);
  }

  /**
   * 按给定凭据建连；设置页保存凭据后也走这里。
   *
   * @param credentials `{ appId, appSecret }`
   */
  function connect(credentials) {
    transport.start({ ...credentials, onEvent, onStatus });
  }

  /**
   * 解绑：把 user 清掉、在册的配对码一起作废，再给原 user 发一张告知卡片
   * （不等着发完，不影响解绑本身）。
   */
  async function unbindUser() {
    const { userId } = readSettings();
    await writeSettings({ ...readSettings(), userId: '' });
    clearPairingCode();
    logger.info('已解绑 user，在册的配对码一并作废');
    sendUnboundNotice({ push, userId });
  }

  const panel = createSettingsPanel({
    ctx,
    store,
    readCredentials,
    reconnect: connect,
    unbindUser,
    readStatus: () => transport.status(),
  });
  panel.register();

  ctx.effect(() => {
    sessionEvents.start({ onEvent: hostReceiver.handle });
    agentEvents.start({ onEvent: hostReceiver.handleAgent });
    userQuestions.start({ onRequest: question.onRequest });
    approvals.start({ onRequest: approval.onRequest });
    return () => {
      sessionEvents.stop();
      agentEvents.stop();
      userQuestions.stop();
      approvals.stop();
    };
  }, `${PLUGIN_NAME}: 宿主事件`);

  connect(await readCredentials());
  ctx.effect(() => () => transport.stop(), `${PLUGIN_NAME}: 飞书长连接`);
}
