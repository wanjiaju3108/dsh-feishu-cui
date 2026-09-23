/** 日志出口：把 `feishu-cui` 这一路日志按级别写到 stdout / stderr。 */

/** logger 命名空间；建 logger 用的就是这个字符串。 */
export const LOGGER_NAMESPACE = 'feishu-cui';

/**
 * 一个参数渲染成文本。
 *
 * @param value 任意值
 * @returns 文本
 */
function render(value) {
  let text;
  if (value instanceof Error) text = value.stack ?? value.message;
  else if (typeof value === 'string') text = value;
  else if (typeof value === 'object' && value !== null) {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else text = String(value);
  return text.replace(/\r?\n/g, '\\n');
}

/**
 * 把 `message.args` 拼成一行。
 *
 * @param args 消息参数
 * @returns 一行文本
 */
function formatArgs(args) {
  const [first, ...rest] = args;
  if (typeof first !== 'string') return [first, ...rest].map(render).join(' ');
  let index = 0;
  const text = first.replace(/%[sdifjoO%]/g, (match) => {
    if (match === '%%') return '%';
    if (index >= rest.length) return match;
    index += 1;
    return render(rest[index - 1]);
  });
  const tail = rest.slice(index).map(render).join(' ');
  return tail ? `${text} ${tail}` : text;
}

/**
 * 挂上日志出口。
 *
 * @param ctx Cordis 上下文
 */
export function registerLogExporter(ctx) {
  ctx.logger.exporter({
    levels: { default: 2 },
    export: (message) => {
      if (message.name !== LOGGER_NAMESPACE) return;
      const time = new Date(message.ts).toISOString();
      const line = `[${time}] [${message.type}] [${message.name}] ${formatArgs(message.args)}\n`;
      if (message.type === 'error') process.stderr.write(line);
      else process.stdout.write(line);
    },
  });
}
