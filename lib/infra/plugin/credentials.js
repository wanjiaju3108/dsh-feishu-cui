/** 凭据读写：包一层宿主凭据服务（`ctx.get('credentials')`）。 */

/**
 * 建一个凭据存储器。
 *
 * @param deps.credentials 宿主凭据服务（`ctx.get('credentials')`）
 * @param deps.logger 日志
 * @returns describe / read / write
 */
export function createCredentialStore({ credentials, logger }) {
  /**
   * 查询一个凭据的配置状态（不回值，适合下发给设置页）。
   *
   * @param ref 凭据引用名
   * @returns `{ configured, writable }`
   */
  async function describe(ref) {
    try {
      return await credentials.describe(ref);
    } catch (error) {
      logger.warn(`查询凭据 ${ref} 状态失败：${error?.message ?? error}`);
      return { configured: false, writable: false };
    }
  }

  /**
   * 读一个凭据；缺席是合法状态，返回空串。
   *
   * @param ref 凭据引用名
   * @returns 凭据值；读不到时为空串
   */
  async function read(ref) {
    try {
      return (await credentials.resolve(ref))?.value ?? '';
    } catch (error) {
      logger.warn(`读取凭据 ${ref} 失败，按未配置处理：${error?.message ?? error}`);
      return '';
    }
  }

  /**
   * 写一个凭据。
   *
   * @param ref 凭据引用名
   * @param value 凭据值
   */
  async function write(ref, value) {
    await credentials.set(ref, value);
  }

  return { describe, read, write };
}
