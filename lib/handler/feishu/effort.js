/** 推理深度卡片：菜单里点「推理深度」时发卡，卡片上点行 / 确定 / 取消时接着办。 */

import {
  CANCEL_TEXT,
  CONFIRM_TEXT,
  EFFORT_CANCELLED_TEXT,
  EFFORT_CARD_SUMMARY,
  EFFORT_CARD_TITLE,
  EFFORT_DEFAULT_LABEL,
  EFFORT_GONE_ERROR,
  EFFORT_NO_MODEL_TEXT,
  EFFORT_NO_TIERS_TEXT,
  EFFORT_STALE_TEXT,
  EFFORT_REQUESTED_TEXT,
  MODEL_CATALOG_FAILED_TEXT,
  MODEL_GONE_ERROR,
  MODEL_SELECT_UNSUPPORTED_TEXT,
  NO_CURRENT_SESSION_TEXT,
} from '../../common/copy.js';
import { resolveModel } from '../../infra/host/models.js';
import { readSettings } from '../../infra/plugin/config.js';
import { buildOptionCard } from '../../ui/option-card.js';
import { buildTextCard } from '../../ui/text-card.js';
import { createOptionCardFlow } from './option-card-flow.js';

/** 这个菜单项的 `event_key`，也是卡片的类型。 */
export const EFFORT_KEY = 'effort';

/**
 * 建推理深度卡片处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.models 模型目录（`infra/host/models.js` 的 `createModelCatalog`）
 * @returns pushEffortCard / handleEffortCard
 */
export function createEffortHandler({ logger, push, models }) {
  /**
   * 读目录和当前会话的模型（连同它的档位），拼一张推理深度卡片。
   *
   * @param deps.selected 当前勾着的那一档的 id
   * @param deps.error 写回正文最上面的那句话
   * @returns `{ card, detail }`，或 `{ text }`（没有当前会话 / 目录读不到 / 模型认不出 / 它没有档位）
   */
  async function readCard({ selected, error }) {
    const { sessionId } = readSettings();
    if (!sessionId) return { text: NO_CURRENT_SESSION_TEXT };
    const listed = await models.catalog();
    if (!listed?.groups?.length) return { text: MODEL_CATALOG_FAILED_TEXT };
    const current = resolveModel(await models.current(sessionId), listed.groups);
    if (!current) return { text: EFFORT_NO_MODEL_TEXT };
    if (current.efforts.length === 0) return { text: EFFORT_NO_TIERS_TEXT(current.model.name) };

    const summary = EFFORT_CARD_SUMMARY(current.model.name, current.effort?.name ?? EFFORT_DEFAULT_LABEL);
    return {
      card: buildOptionCard({
        tag: EFFORT_KEY,
        requestId: '',
        title: EFFORT_CARD_TITLE,
        groups: [{
          id: '',
          text: error ? `${error}\n${summary}` : summary,
          options: current.efforts.map((item) => ({ label: item.name, value: item.id })),
        }],
        picked: new Map([['', selected ?? current.effort?.id ?? '']]),
        confirmText: CONFIRM_TEXT,
        cancelText: CANCEL_TEXT,
      }),
      detail: `模型 ${current.model.id} 共 ${current.efforts.length} 档`,
    };
  }

  const flow = createOptionCardFlow({
    logger,
    push,
    key: EFFORT_KEY,
    label: '推理深度卡片',
    cancelledText: EFFORT_CANCELLED_TEXT,
    staleText: EFFORT_STALE_TEXT,
    readCard,

    /**
     * 确定：把选中的档位装到确认这一刻的当前模型上。
     *
     * @param deps.pick 选中的档位 id
     * @returns `{ requested, submit }`，或 `{ text }` / `{ error }`
     */
    onConfirm: async ({ pick }) => {
      const { sessionId } = readSettings();
      if (!sessionId) return { text: NO_CURRENT_SESSION_TEXT };
      const listed = await models.catalog();
      if (!listed?.groups?.length) return { text: MODEL_CATALOG_FAILED_TEXT };
      const current = resolveModel(await models.current(sessionId), listed.groups);
      if (!current) return { text: MODEL_GONE_ERROR };
      const effort = current.efforts.find((item) => item.id === pick);
      if (!effort) return { error: EFFORT_GONE_ERROR };

      return {
        requested: buildTextCard(EFFORT_REQUESTED_TEXT(effort.name)),
        submit: async () => {
          const result = await models.select({
            sessionId,
            provider: current.group.id,
            model: current.model.id,
            reasoningEffort: effort.id,
          });
          if (!result.ok) return { error: result.unsupported ? MODEL_SELECT_UNSUPPORTED_TEXT : result.message };
          logger.info(`已请求把当前会话的推理深度改成 ${effort.name}（模型 ${current.model.id}）`);
          return undefined;
        },
      };
    },
  });

  return { pushEffortCard: flow.pushCard, handleEffortCard: flow.handleCardAction };
}
