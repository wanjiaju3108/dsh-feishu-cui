/** 插件条目 config 里一个字段怎么取成实际值。`host/` 与 `plugin/` 都可能要读配置，所以放这儿。 */

/**
 * 读一个 config 字段的值。
 *
 * 标了 volatile 的字段解析出来是带 get() 的引用（见 cosmokit 的 createVolatile），直接读
 * 会拿到引用对象本身；插件被直接挂载、没经过 Loader 时则可能是普通值。
 *
 * @param value config 里的字段值
 * @param fallback 取不到时的兜底值
 * @returns 字段的实际值
 */
export function readConfigField(value, fallback) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
    return value.get() ?? fallback;
  }
  return value ?? fallback;
}
