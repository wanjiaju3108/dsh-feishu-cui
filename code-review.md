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

