读完了 `dsh-feishu-cui` 全部 59 个 `.js`（5948 行），按「文件结构 / 代码层级」看。结论：**分层是真的分了、且无环，但 README 写的依赖规则有一条不成立，另有两处横切破坏了层边界**。

## 一、分层实测

`lib/index.js` 是唯一装配点（22 个对象都在这里造，其它文件只导出工厂）；全图 **0 个循环依赖**；没有孤儿模块（只有 `index.js`、`settings/client.js` 无人 import，它们本来就是入口）。

README 第 196 行写的四条依赖规则，逐条核对：

| 规则 | 实测 |
|---|---|
| `ui/` 只 import `ui/` | 成立（5 条边全在 ui 内） |
| `handler/` 能 import `ui/`、`infra/`、`cache/` | 成立 |
| `driving/` 认 `handler/` 和 `ui/`，只为拿卡片类型常量 | 基本成立，但漏了 `copy.js` 和 `cache/`（见下） |
| `transport/` 谁都不认 | **不成立** |

## 二、P2：层内结构问题

**5. `question.js` 与 `approval.js` 是同一套骨架抄了两遍**（各 293 / 236 行）
逐段对照：`pending` Map、`retire()`、`watchAbort()`、`onRequest()` 里那四道检查（有没有当前会话 → 是不是当前会话 → 这一轮是不是飞书发起的 → 发卡）→ `sendCard` 之后补一刀作废的竞态分支 → `onCardAction()` 的「不在册」路径，形状完全一样，只有「交回什么」不同（`question.js:145` reject error，`approval.js:143` resolve 决议词）。
项目已经为「选择卡」抽过同类的骨架（`handler/feishu/option-card-flow.js`，5 个 handler 共用）；`handler/host/` 这边缺一个对应的件。这是当前最值得动的一处重复。

**6. 卡片类型常量两处定义**
`handler/*.js` 里 8 个（`SESSION_LIST_KEY`、`WORKSPACES_KEY`、`MODEL_KEY`、`EFFORT_KEY`、`PERMISSION_KEY`、`PAIRING_KEY`、`BALANCE_KEY`、`QUESTION_CARD_KEY`），`ui/*.js` 里 2 个（`ANSWER_CARD_KEY`、`APPROVAL_CARD_KEY`）。`QUESTION_CARD_KEY` 之所以在 handler 里，是因为反问卡复用 `ui/option-card.js`、没有自己的 ui 文件。同一个概念（发卡时写进 `value.tag`、回调时按它路由）分散在两个层、两种放法。

**7. 转换层依赖某个 handler 的兴趣清单**
`lib/driving/host/receiver.js:3,57` import `handler/host/settings-watch.js` 的 `WATCHED_SESSION_EVENTS`，用它决定「这条事件要不要把 `settings` 载荷一起带出来」；`driving/host/router.js:3,16` 又 import 同一个常量做路由。往后加一个被盯的事件，要同时改 `receiver`（载荷）和 `router`（路由）——这两处本来可以只由路由表决定。

**8. `index.js` 里有业务，`init.js` 位置尴尬**
`README.md:186` 说 `index.js`「不写业务」，但 `lib/index.js:122-131`（`announceConnected`：选文案、查标题）和 `lib/index.js:161-172`（`unbindUser`：清设置、作废配对码、发解绑卡）都是业务。而 `init.js`（22 行，只做「找绑定的人 + 发卡」）只被 `lib/index.js:31,127` 用一次——一个通告动作被切成「顶层 init.js + index.js 里的文案决策」两半。

**9. `infra/host/` 取宿主服务有三种写法并存**
- `access.method(ns, name)`：`session.js:144,171,196,214,233`、`models.js:55,76,96`、`permissions.js:38`
- `ctx.get()` 现取：`session.js:33,69`、`workspace.js:19,47`、`models.js:80`
- 装配时注入服务对象：`index.js:65,67,74`（`settings`、`credentials`）

`service-access.js` 的用途是「按名字借一个绑好 `this` 的方法」，但只覆盖了一部分；同一个 `sessionController` 在 `models.js` 里一会儿走 `access`、一会儿走 `ctx.get('sessionProjections')`。

## 三、P3：轻微

- `lib/common/events/` 这个目录下只有 `feishu-event.js` 一个文件；`common/` 一共 2 个文件 33 行。
- `lib/handler/feishu/pending-card.js` 与 `lib/cache/pending-cards.js` 名字过于接近（一个是 handler、一个是存储）；`createPendingCard` 的 `onCancel`（`pending-card.js:25`）**从没被传过**——两个调用点（`option-card-flow.js:45`、`pairing.js:35`）都只传 `{ logger, push }`。
- `copy.js` 里 `'确定'`/`'取消'` 有三份：`CONFIRM_TEXT`/`CANCEL_TEXT`（:70,72）、`PAIRING_CONFIRM_TEXT`/`PAIRING_CANCEL_TEXT`（:16,19）、`QUESTION_CONFIRM_TEXT`/`QUESTION_CANCEL_TEXT`（:159,162）。
- `README.md:171,172` 的行数与实际不符：`index.js` 写 190 实际 199，`copy.js` 写 383 实际 389。其余各层的文件数与行数**完全对得上**。

## 四、站得住的地方（不用动）

- 每个工厂只在 `index.js` 调一次，装配点唯一；`ctx.effect` 只管生命周期。
- `driving/feishu/` 与 `driving/host/`、`handler/feishu/` 与 `handler/host/` 对称；`transport/host/` 三个订阅文件形状一致。
- `ui/` 只出 JSON、不含文案，这条守住了。
- `option-card-flow.js` 把「发卡 / 在册 / 点行 / 确定 / 取消 / 失效」收成一处，是这套结构里最有效的一次抽象。

