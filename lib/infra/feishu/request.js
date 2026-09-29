/**
 * 飞书请求的公共部分：成功判定与重试。
 *
 * 出站（push.js）和查姓名（user-name.js）都要同一套行为——没凭据就放弃、抛错退避重试、
 * 业务失败（`code !== 0`）不重试——所以收在这里一份，两边都用它。
 */

import { setTimeout as delay } from 'node:timers/promises';

/** 一次请求最多试几次。 */
const MAX_ATTEMPTS = 3;

/** 重试的退避基数（毫秒），第 n 次等 `RETRY_BASE_MS * n`。 */
const RETRY_BASE_MS = 300;

/**
 * 判断飞书接口返回体是不是成功。
 *
 * @param response 飞书接口返回体
 * @returns 成功时 true
 */
export function isFeishuOk(response) {
  if (response === undefined || response === null) return false;
  if (response.code === undefined) return response.data !== undefined;
  return response.code === 0;
}

/**
 * 建请求句柄。
 *
 * @param deps.logger 日志
 * @param deps.client 取当前 REST 客户端；没凭据时返回 undefined
 * @param deps.describeMissing 没凭据时写进日志的那句话（省略时用通用说法）
 * @returns 请求句柄：call
 */
export function createRequester({ logger, client, describeMissing = '凭据未配置，无法请求飞书' }) {
  /**
   * 发一次请求：没客户端直接放弃；抛错按 `MAX_ATTEMPTS` 重试，退避随次数递增。
   *
   * 业务失败不重试，但和放弃一样都会把原因交给 `onFailure`——有些失败调用方要换一种方式回话。
   *
   * @param request 拿到客户端后真正要发的请求
   * @param describe 日志里用来描述这次请求的短句
   * @param onFailure 失败原因回执
   * @returns 成功时返回响应体；放弃、没凭据或业务失败时 undefined
   */
  async function call(request, describe, onFailure) {
    const live = client();
    if (!live) {
      logger.warn(describeMissing);
      onFailure?.({ message: describeMissing });
      return undefined;
    }
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await request(live);
        if (isFeishuOk(response)) return response;
        logger.warn(`${describe}被拒：code=${response?.code} msg=${response?.msg}`);
        onFailure?.({ code: response?.code, message: response?.msg });
        return undefined;
      } catch (error) {
        if (attempt === MAX_ATTEMPTS) {
          logger.warn(`${describe}失败，已放弃（尝试 ${attempt} 次）：${error?.message ?? error}`);
          onFailure?.({ message: error?.message ?? String(error) });
          return undefined;
        }
        logger.warn(`${describe}失败，准备第 ${attempt + 1} 次尝试：${error?.message ?? error}`);
        await delay(RETRY_BASE_MS * attempt);
      }
    }
    return undefined;
  }

  return { call };
}
