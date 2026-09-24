/** dsh-feishu-cui 宿主半边入口：拿宿主服务、把各层串起来，再按凭据把飞书长连接启起来。 */

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
import { createSessionRenameHandler } from './handler/feishu/session-rename.js';
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
import { readSettings, registerSettings } from './infra/plugin/config.js';
import { createCredentialStore } from './infra/plugin/credentials.js';
import { registerLogExporter } from './infra/plugin/log-exporter.js';
import { createNotices } from './notices.js';
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

/** 插件条目的 config：当前会话、绑定的 user、当前工作区三项。 */
export { Config } from './infra/plugin/config.js';

/**
 * 插件入口。
 *
 * @param ctx Cordis 上下文
 * @param config 补丁层给的条目配置（可为空对象）
 */
export async function apply(ctx, config) {
  const logger = ctx.logger('feishu-cui');
  registerLogExporter(ctx);

  registerSettings({ ctx, config, logger });

  const store = createCredentialStore({ credentials: ctx.get('credentials'), logger });

  const transport = createTransport({ logger });

  const push = createPush({ logger, client: () => transport.rest() });

  const pairing = createPairingHandler({ logger, push });
  const balanceReader = createBalanceReader({ logger, credentials: ctx.get('credentials') });
  const balance = createBalanceHandler({ logger, push, balance: balanceReader });
  const access = createServiceAccess({ ctx, logger });
  const workspaces = createWorkspaces({ logger, access });
  const catalog = createSessionCatalog({ logger, access, workspaces });
  const notices = createNotices({ logger, push, catalog });
  const sessions = createSessionsHandler({ logger, push, catalog });
  const sessionRename = createSessionRenameHandler({ logger, push, catalog });
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
  const models = createModelCatalog({ logger, access });
  const permissions = createPermissions({ logger, access });
  const settingsWatch = createSettingsWatch({ logger, push, models, permissions });
  const hostRouter = createHostRouter({ answer, settingsWatch });
  const hostReceiver = createHostReceiver({ logger, admission: hostAdmission, onVerdict: hostRouter.route });
  const model = createModelHandler({ logger, push, models });
  const effort = createEffortHandler({ logger, push, models });
  const permission = createPermissionHandler({ logger, push, permissions });
  const warn = createWarnHandler({ logger, push });
  const router = createRouter({
    logger, pairing, balance, sessions, sessionRename, workspaces: workspaceCards, model, effort, permission,
    message, answer, question, approval, warn,
  });
  const admission = createAdmission({ readSettings });
  const onEvent = createReceiver({ logger, admission, onVerdict: router.route });

  /**
   * 按给定凭据建连；设置页保存凭据后也走这里。
   *
   * @param credentials `{ appId, appSecret }`
   */
  function connect(credentials) {
    transport.start({ ...credentials, onEvent, onStatus: notices.onStatus });
  }

  const panel = createSettingsPanel({
    ctx,
    store,
    readCredentials: store.readAppCredentials,
    reconnect: connect,
    unbindUser: notices.unbindUser,
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

  connect(await store.readAppCredentials());
  ctx.effect(() => () => transport.stop(), `${PLUGIN_NAME}: 飞书长连接`);
}
