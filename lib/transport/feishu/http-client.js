/** 出站那一半的 REST 客户端：按凭据造飞书 SDK 的 HTTP 客户端。 */
import { Client, Domain } from '@larksuiteoapi/node-sdk';

/**
 * 建一个 REST 客户端。
 *
 * @param deps.appId 应用 ID
 * @param deps.appSecret 应用密钥
 * @returns 飞书 SDK 的 HTTP 客户端
 */
export function createHttpClient({ appId, appSecret }) {
  return new Client({ appId, appSecret, domain: Domain.Feishu });
}
