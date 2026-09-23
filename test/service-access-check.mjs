/** 宿主服务取用口：按名字借服务或借它上面一个方法，缺席时只说一次。 */

import { createCheck, createLogger, libUrl } from './harness.mjs';

const { createServiceAccess } = await import(libUrl('infra/host/service-access.js'));

const check = createCheck();
const { logger, lines } = createLogger();

const live = {
  name: 'live',
  value: 42,
  /** 用来核对 this 有没有绑上。 */
  read() {
    return this.value;
  },
};
const access = createServiceAccess({ ctx: { get: (name) => (name === 'live' ? live : undefined) }, logger });

check.eq('借服务：拿到的就是那个服务', access.service('live'), live);
check.eq('借不存在的服务：undefined', access.service('nope'), undefined);
access.service('nope');
check.eq('同一个服务缺席，只警告一次', lines.warn.filter((line) => line.includes('宿主没有 nope 服务')).length, 1);
check.ok('警告里写了是哪个服务', lines.warn.some((line) => line.includes('宿主没有 nope 服务')));

const read = access.method('live', 'read');
check.eq('借方法：this 绑在服务上', read(), 42);
check.eq('借服务上没有的方法：undefined', access.method('live', 'missing'), undefined);
access.method('live', 'missing');
check.eq('同一个方法缺席，只警告一次', lines.warn.filter((line) => line.includes('宿主服务 live 没有 missing 方法')).length, 1);

check.eq('服务整个缺席时，借方法也是 undefined', access.method('nope', 'read'), undefined);
check.eq('服务缺席时不再多警告一条「没有方法」', lines.warn.filter((line) => line.includes('没有 read 方法')).length, 0);

check.finish();
