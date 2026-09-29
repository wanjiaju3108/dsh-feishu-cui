/**
 * 查飞书用户的姓名。
 *
 * 设置页的「绑定用户」手上只有 open_id，要显示成姓名只能拿它去通讯录接口换。绑定用户只有一个、
 * 接口调用很便宜，所以**每次都重新查**：改了名，或者刚配好权限，点一下设置页的刷新就能看到。
 *
 * 这一步是**尽力而为**：缺权限、被拒、超时都只返回空串，由调用方退回显示「已绑定」。整次请求
 * （含重试）有超时上限，不会把设置页的加载拖住。
 */

import { createRequester } from './request.js';

/** 查姓名整次请求（含重试）最多等多久，超了就放弃。 */
const LOOKUP_TIMEOUT_MS = 3000;

/**
 * 建姓名解析器。
 *
 * @param deps.logger 日志
 * @param deps.client 取当前飞书客户端：`() => client | undefined`
 * @returns 解析器句柄：resolve(openId)
 */
export function createUserNameResolver({ logger, client }) {
  /** 重试与成功判定走公共实现，跟出站同一套。 */
  const { call } = createRequester({ logger, client, describeMissing: '凭据未配置，无法查用户姓名' });

  /**
   * 给整次请求（含重试）套一个超时：超时按查不到处理。
   *
   * @param promise 要等的请求
   * @returns 请求结果；超时返回 undefined
   */
  async function withTimeout(promise) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(undefined), LOOKUP_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 按 open_id 查姓名。
   *
   * @param openId 用户的 open_id
   * @returns 姓名；查不到时返回空串（调用方负责退回显示「已绑定」）
   */
  async function resolve(openId) {
    if (!openId) return '';
    const response = await withTimeout(call(
      (live) => live.contact.v3.user.get({
        path: { user_id: openId },
        params: { user_id_type: 'open_id' },
      }),
      '查询绑定用户姓名',
    ));
    // 需要通讯录权限，而且用户要在应用的通讯录权限范围里；缺任一条都会在这里被拒。
    const name = typeof response?.data?.user?.name === 'string' ? response.data.user.name : '';
    if (!name) logger.warn(`取不到 ${openId} 的姓名，绑定那一栏显示「已绑定」`);
    return name;
  }

  return { resolve };
}
