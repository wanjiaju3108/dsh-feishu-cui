/** 模型目录与选择：从宿主读按 provider 分组的可用模型、读当前会话的模型选择、把选择装到当前会话上；另有两个纯函数负责把选择落到目录里的具体一条上。 */

import { MODEL_SELECT_UNSUPPORTED_TEXT } from '../../copy.js';

/**
 * 把一个选择落到目录里的具体一条上，并把它的推理档位一起带上。
 *
 * @param picked 用户当前的选择 `{ provider, model, reasoningEffort? }`
 * @param groups 目录里的 provider 分组
 * @returns `{ group, model, efforts, effort }`；认不出时 undefined
 */
export function resolveModel(picked, groups) {
  const candidates = (groups ?? []).flatMap((group) => (group.models ?? []).map((model) => ({ group, model })));
  if (candidates.length === 0 || !picked?.model) return undefined;
  const sameModel = candidates.filter((item) => item.model.id === picked.model);
  if (sameModel.length === 0) return undefined;
  const chosen = sameModel.find((item) => item.group.id === picked.provider) ?? sameModel[0];
  const efforts = chosen.model.reasoning?.efforts ?? [];
  const effort = efforts.find((item) => item.id === picked.reasoningEffort);
  return { group: chosen.group, model: chosen.model, efforts, effort };
}

/**
 * 把一个选择归一化成交给宿主的三元组（`provider` / `model` / 可选的 `reasoningEffort`）。
 *
 * @param picked 用户当前的选择
 * @param groups 目录里的 provider 分组
 * @returns `{ provider, model, reasoningEffort? }`；认不出时 undefined
 */
export function normalizeModel(picked, groups) {
  const found = resolveModel(picked, groups);
  if (!found) return undefined;
  return {
    provider: found.group.id,
    model: found.model.id,
    ...found.effort ? { reasoningEffort: found.effort.id } : {},
  };
}

/**
 * 建模型目录封装。
 *
 * @param deps.ctx Cordis 上下文
 * @param deps.logger 日志
 * @param deps.access 宿主服务取用口（`infra/host/service-access.js`）
 * @returns `{ catalog, current, select }`
 */
export function createModelCatalog({ ctx, logger, access }) {
  /**
   * 读模型目录。
   *
   * @returns `{ groups, default, failures, routableProviders }`；读不到时 undefined
   */
  async function catalog() {
    const modelCatalog = access.method('sessionController', 'modelCatalog');
    if (modelCatalog === undefined) {
      logger.warn('会话控制器不支持模型目录，模型卡片发不出来');
      return undefined;
    }
    try {
      return await modelCatalog();
    } catch (error) {
      logger.warn(`读模型目录失败：${error?.message ?? error}`);
      return undefined;
    }
  }

  /**
   * 读当前会话的模型选择。
   *
   * @param sessionId 会话 ID
   * @returns `{ provider, model, reasoningEffort? }`；都没有时 undefined
   */
  async function current(sessionId) {
    const listed = await catalog();
    const resolveAgent = access.method('sessionController', 'resolveAgent');
    if (resolveAgent === undefined || !sessionId) return listed?.default;
    try {
      const resolved = await resolveAgent(sessionId);
      const state = ctx.get('sessionProjections')?.stateOf?.(resolved?.agent?.session, 'modelSelection');
      const picked = state?.pending ?? state?.lastUsed;
      if (picked?.provider && picked?.model) return picked;
    } catch (error) {
      logger.warn(`读会话 ${sessionId} 的模型选择失败，退回默认：${error?.message ?? error}`);
    }
    return listed?.default;
  }

  /**
   * 把模型选择装到会话上。
   *
   * @param request `{ sessionId, provider, model, reasoningEffort? }`
   * @returns `{ ok: true, selected }` 或 `{ ok: false, error }`
   */
  async function select(request) {
    const selectModel = access.method('sessionController', 'selectModel');
    if (selectModel === undefined) return { ok: false, error: MODEL_SELECT_UNSUPPORTED_TEXT };
    try {
      const result = await selectModel({
        sessionId: request.sessionId,
        provider: request.provider,
        model: request.model,
        ...request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {},
      });
      return { ok: true, selected: result?.selected ?? { provider: request.provider, model: request.model } };
    } catch (error) {
      logger.warn(`切换模型失败：${error?.message ?? error}`);
      return { ok: false, error: error?.message ?? String(error) };
    }
  }

  return { catalog, current, select };
}
