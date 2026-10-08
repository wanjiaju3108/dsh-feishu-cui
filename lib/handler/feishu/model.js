/** 模型卡片：菜单里点「模型」时发卡，卡片上点行 / 确定 / 取消时接着办。 */

import {
  CANCEL_TEXT,
  CONFIRM_TEXT,
  MODEL_CARD_EMPTY_TEXT,
  MODEL_CARD_FAILURES,
  MODEL_CARD_SUMMARY,
  MODEL_CARD_TITLE,
  MODEL_CARD_UNKNOWN_TEXT,
  MODEL_CANCELLED_TEXT,
  MODEL_CATALOG_FAILED_TEXT,
  MODEL_REQUESTED_EFFORT_TEXT,
  MODEL_GONE_ERROR,
  MODEL_STALE_TEXT,
  MODEL_REQUESTED_TEXT,
  MODEL_SELECT_UNSUPPORTED_TEXT,
  NO_CURRENT_SESSION_TEXT,
} from '../../common/copy.js';
import { normalizeModel } from '../../infra/host/models.js';
import { readSettings } from '../../infra/plugin/config.js';
import { buildOptionCard } from '../../ui/option-card.js';
import { buildTextCard } from '../../ui/text-card.js';
import { createOptionCardFlow } from './option-card-flow.js';

/** 这个菜单项的 `event_key`，也是卡片的类型。 */
export const MODEL_KEY = 'model';

/**
 * 拼出选项行的值：`服务商/模型`。
 *
 * @param provider 服务商 id
 * @param model 模型 id
 * @returns 选项行的值
 */
function valueOf(provider, model) {
  return `${provider}/${model}`;
}

/**
 * 把选项行的值拆回 `{ provider, model }`。
 *
 * @param value 选项行的值
 * @returns `{ provider, model }`；拆不出服务商时 undefined
 */
function parseValue(value) {
  const at = typeof value === 'string' ? value.indexOf('/') : -1;
  if (at <= 0 || at === value.length - 1) return undefined;
  return { provider: value.slice(0, at), model: value.slice(at + 1) };
}

/**
 * 建模型卡片处理。
 *
 * @param deps.logger 日志
 * @param deps.push 出站句柄（`infra/feishu/push.js` 的 `createPush`）
 * @param deps.models 模型目录（`infra/host/models.js` 的 `createModelCatalog`）
 * @returns pushModelCard / handleModelCard
 */
export function createModelHandler({ logger, push, models }) {
  /**
   * 读目录和当前会话的选择，拼一张按 provider 分组的模型卡片。
   *
   * @param deps.selected 当前勾着的那一行的值（`服务商/模型`）
   * @param deps.error 写回正文最上面的那句话
   * @returns `{ card, detail }` 或 `{ text }`（没有当前会话 / 宿主没有可用模型）
   */
  async function readCard({ selected, error }) {
    const { sessionId } = readSettings();
    if (!sessionId) return { text: NO_CURRENT_SESSION_TEXT };
    const listed = await models.catalog();
    if (!listed?.groups?.length) return { text: MODEL_CARD_EMPTY_TEXT };

    const flat = listed.groups.flatMap((group) => (group.models ?? []).map((model) => ({ group, model })));
    const current = normalizeModel(await models.current(sessionId), listed.groups);

    const currentItem = flat.find((item) => item.model.id === current?.model && item.group.id === current?.provider)
      ?? flat.find((item) => item.model.id === current?.model);
    // 摘要行必须带上供应商：行标签不再带（供应商是组抬头），只剩摘要这一处需要分清是哪家。
    const summaryLabel = currentItem === undefined
      ? undefined
      : `${currentItem.model.name}（${currentItem.group.name ?? currentItem.group.id}）`;
    const lines = [summaryLabel === undefined ? MODEL_CARD_UNKNOWN_TEXT : MODEL_CARD_SUMMARY(summaryLabel)];
    if (listed.failures?.length) lines.push(MODEL_CARD_FAILURES(listed.failures.length));

    // 当前勾着的那一行：值是 `服务商/模型`，勾记在它所属 provider 那一组上；别的组查不到、自然一个不勾。
    const value = selected ?? (currentItem ? valueOf(currentItem.group.id, currentItem.model.id) : '');
    const picked = new Map(value ? [[parseValue(value)?.provider ?? '', value]] : []);

    return {
      card: buildOptionCard({
        tag: MODEL_KEY,
        requestId: '',
        title: MODEL_CARD_TITLE,
        // 第一组只放摘要（没有选项），之后一个 provider 一组，组抬头是 provider 名；空组不出光杆抬头。
        groups: [
          { id: '', text: error ? `${error}\n${lines.join('\n')}` : lines.join('\n'), options: [] },
          ...listed.groups
            .filter((group) => (group.models ?? []).length > 0)
            .map((group) => ({
              id: group.id,
              text: `**${group.name ?? group.id}**`,
              options: (group.models ?? []).map((model) => ({ label: model.name, value: valueOf(group.id, model.id) })),
            })),
        ],
        picked,
        confirmText: CONFIRM_TEXT,
        cancelText: CANCEL_TEXT,
      }),
      detail: `共 ${flat.length} 个模型（${listed.groups.length} 个服务商）`,
    };
  }

  const flow = createOptionCardFlow({
    logger,
    push,
    key: MODEL_KEY,
    label: '模型卡片',
    cancelledText: MODEL_CANCELLED_TEXT,
    staleText: MODEL_STALE_TEXT,
    readCard,

    /**
     * 确定：把选项的值拆成 `{ provider, model }`，归一化到目录里的真实组合，再写会话级模型。
     *
     * @param deps.pick 选中那一行的值（`服务商/模型`）
     * @returns `{ requested, submit }`，或 `{ text }` / `{ error }`
     */
    onConfirm: async ({ pick }) => {
      const { sessionId } = readSettings();
      if (!sessionId) return { text: NO_CURRENT_SESSION_TEXT };
      const listed = await models.catalog();
      if (!listed?.groups?.length) return { text: MODEL_CATALOG_FAILED_TEXT };
      const current = normalizeModel(await models.current(sessionId), listed.groups);
      const route = parseValue(pick);
      const picked = route && normalizeModel(
        { provider: route.provider, model: route.model, reasoningEffort: current?.reasoningEffort },
        listed.groups,
      );
      if (!picked) return { error: MODEL_GONE_ERROR };

      const item = listed.groups
        .flatMap((group) => (group.models ?? []).map((model) => ({ group, model })))
        .find((candidate) => candidate.group.id === picked.provider && candidate.model.id === picked.model);
      const lines = [MODEL_REQUESTED_TEXT(item?.model.name ?? picked.model, picked.provider)];
      if (picked.reasoningEffort) {
        const effort = item?.model.reasoning?.efforts?.find((tier) => tier.id === picked.reasoningEffort);
        lines.push(MODEL_REQUESTED_EFFORT_TEXT(effort?.name ?? picked.reasoningEffort));
      }

      return {
        requested: buildTextCard(lines.join('\n')),
        submit: async () => {
          const result = await models.select({ sessionId, ...picked });
          if (!result.ok) return { error: result.unsupported ? MODEL_SELECT_UNSUPPORTED_TEXT : result.message };
          logger.info(`已请求把当前会话的模型改成 ${picked.model}（${picked.provider}）`);
          return undefined;
        },
      };
    },
  });

  return { pushModelCard: flow.pushCard, handleModelCard: flow.handleCardAction };
}
