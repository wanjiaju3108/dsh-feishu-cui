/** 给人看的话都放这里，别的文件里不写死给用户看的句子。 */

/** 已经有绑定会话时再点「申请配对」，回给飞书的那句话。 */
export const PAIRING_ALREADY_BOUND_TEXT = '存在绑定会话，无法申请';

/** 配对输入框卡片的标题。 */
export const PAIRING_CARD_TITLE = '申请配对';

/** 配对输入框卡片标题下面那段说明。 */
export const PAIRING_CARD_DESCRIPTION = '设置页里有一串配对码，把它填到下面这个输入框里。';

/** 配对码输入框的占位文案。 */
export const PAIRING_CARD_PLACEHOLDER = '配对码';

/** 配对卡片的「确定」按钮。 */
export const PAIRING_CONFIRM_TEXT = '确定';

/** 配对卡片的「取消」按钮。 */
export const PAIRING_CANCEL_TEXT = '取消';

/** 配对成功时，卡片换成这一句。 */
export const PAIRING_SUCCESS_TEXT = '配对成功';

/** 用户填的配对码跟在册的码不一样时回的话。 */
export const PAIRING_CODE_WRONG_TEXT = '配对码不对';

/** 没有在册的配对码时回的话，让人重新申请一次。 */
export const PAIRING_CODE_EXPIRED_TEXT = '配对码已失效，重新申请一次';

/** 用户在配对卡片上点了「取消」时回的话。 */
export const PAIRING_CANCELLED_TEXT = '申请配对已取消';

/** 会话列表卡片的标题。 */
export const SESSION_CARD_TITLE = '选择会话';

/** 会话列表卡片上「确定」和「取消」中间那个「新建」按钮。 */
export const SESSION_NEW_BUTTON_TEXT = '新建';

/** 会话列表卡片标题下面那句摘要：本工作区有几个会话、当前是哪个。 */
export const SESSION_CARD_SUMMARY = (count, currentLabel) =>
  currentLabel
    ? `本工作区有 ${count} 个会话，当前是【${currentLabel}】`
    : `本工作区有 ${count} 个会话，还没有选中当前的`;

/** 这个工作区里一个会话都没有时的说明。 */
export const SESSION_CARD_EMPTY_TEXT = '本工作区还没有会话，可以新建一个。';

/** 认不出当前工作区时，菜单「会话列表」回的这一句。 */
export const SESSION_NO_WORKSPACE_TEXT = '当前没有工作区，无法查看会话列表。';

/** 切完会话之后那张卡上写的话。 */
export const SESSION_SWITCHED_TEXT = (title) => `当前会话已切到【${title}】`;

/** 用户在会话列表卡片上点了「取消」时回的话。 */
export const SESSION_LIST_CANCELLED_TEXT = '会话列表选择已取消';

/** 点到一张已经不在册的会话列表卡片时回的话。 */
export const SESSION_LIST_STALE_TEXT = '这张卡片已失效，请重新打开会话列表';

/** 选中的会话在卡片发出去之后没了，卡片重画时写在正文里的话。 */
export const SESSION_GONE_ERROR = '这个会话已经不在了，重新选一个';

/** 在会话列表卡片上选「新建」但没建出来时回的话。 */
export const SESSION_CREATE_FAILED_ERROR = '新建会话失败';

/** 还有一轮在跑或排着队，不让切会话时回的话。 */
export const SESSION_SWITCH_BUSY_TEXT = '有正在进行的任务，无法切换会话';

/** 表单卡片通用的「确定」按钮。 */
export const CONFIRM_TEXT = '确定';
/** 表单卡片通用的「取消」按钮。 */
export const CANCEL_TEXT = '取消';

/** 工作区列表卡片的标题。 */
export const WORKSPACE_CARD_TITLE = '选择工作区';

/** 工作区列表卡片标题下面那句摘要：有几个工作区、当前是哪个。 */
export const WORKSPACE_CARD_SUMMARY = (count, currentLabel) =>
  currentLabel
    ? `共 ${count} 个工作区，当前是【${currentLabel}】。选完点确定。`
    : `共 ${count} 个工作区。选完点确定。`;

/** 一个工作区都没有时的说明。 */
export const WORKSPACE_CARD_EMPTY_TEXT = '本机还没有工作区，先在网页端建一个。';

/** 工作区标题重名时，列每个工作区目录的那一行。 */
export const WORKSPACE_CARD_LINE = (title, path) => `- ${title}：${path}`;

/** 切完工作区之后那张卡上写的话。 */
export const WORKSPACE_SWITCHED_TEXT = (title) => `当前工作区已切到【${title}】`;

/** 用户在工作区列表卡片上点了「取消」时回的话。 */
export const WORKSPACE_LIST_CANCELLED_TEXT = '工作区选择已取消';

/** 点到一张已经不在册的工作区列表卡片时回的话。 */
export const WORKSPACE_LIST_STALE_TEXT = '这张卡片已失效，请重新打开工作区列表';

/** 选中的工作区在卡片发出去之后没了，卡片重画时写在正文里的话。 */
export const WORKSPACE_GONE_ERROR = '这个工作区已经不在了，重新选一个';

/** 还有一轮在跑或排着队，不让换工作区时回的话。 */
export const WORKSPACE_SWITCH_BUSY_TEXT = '有正在进行的任务，无法切换工作区';

/** 发消息的人不是绑定的那个人时回的话。 */
export const NOT_MATCHED_TEXT = 'CUI会话未匹配';

/** 收到图片 / 文件 / 附件这类非文本消息时回的话。 */
export const UNSUPPORTED_MESSAGE_TEXT = '只支持文本消息';

/** 消息没能交给会话时回的话。 */
export const MESSAGE_PROMPT_FAILED_TEXT = '这条消息没能交给会话，稍后再试';

/** 回答卡片：消息进了队列、还没轮到它时的标题。 */
export const ANSWER_QUEUED_TITLE = '排队中';

/** 回答卡片：被某一轮取走、正在跑时的标题。 */
export const ANSWER_RUNNING_TITLE = '处理中';

/** 回答卡片：这一轮结束时的标题。 */
export const ANSWER_DONE_TITLE = '已完成';

/** 回答卡片：排队里这条被撤了时的标题。 */
export const ANSWER_CANCELLED_TITLE = '对话已取消';

/** 回答卡片上那个「停止」按钮的字。 */
export const ANSWER_STOP_BUTTON_TEXT = '停止';

/** 排队中那张回答卡片上的按钮：把还没跑的那条从队列里撤掉。 */
export const ANSWER_WITHDRAW_BUTTON_TEXT = '撤回';

/** 回答卡片：点了停止、中止信号交出去了时的标题。 */
export const ANSWER_STOPPING_TITLE = '正在停止';

/** 回答卡片：这一轮被停下来了时的标题。 */
export const ANSWER_STOPPED_TITLE = '已停止';

/** 回答卡片：这一轮跑崩了时的标题。 */
export const ANSWER_FAILED_TITLE = '处理失败';

/** 一轮结束却一个正文都没有时，卡片上补的这句。 */
export const ANSWER_EMPTY_TEXT = '这一轮没有可显示的正文';

/** 点到一张已经不在跑的回答卡上的停止按钮时回的话。 */
export const ANSWER_STOP_STALE_TEXT = '这一轮对话已经结束了';

/** 回答卡片：正文多到超过卡片体积上限时的标题。 */
export const ANSWER_TOO_LONG_TITLE = '任务失败';

/** 正文画不下时卡片上写的这句，让人去网页端看。 */
export const ANSWER_TOO_LONG_TEXT = '回答内容过多，卡片无法全部展示，请到网页端查看';

/** 反问卡片的标题。 */
export const QUESTION_CARD_TITLE = '需要你回答';

/** 题目自己没给 header 时，这一题的抬头。 */
export const QUESTION_FALLBACK_HEADER = (index) => `第 ${index + 1} 题`;

/** 反问卡片的「确定」按钮。 */
export const QUESTION_CONFIRM_TEXT = '确定';

/** 反问卡片的「取消」按钮：这次提问作废。 */
export const QUESTION_CANCEL_TEXT = '取消';

/** 交完卷那张卡上，没答的题按跳过交回，写这一句。 */
export const QUESTION_SKIPPED_LABEL = '已跳过';

/** 交完卷之后那张卡的标题。 */
export const QUESTION_DONE_TITLE = '回答已提交';

/** 交完卷之后卡片正文里的一行：哪一题答了什么。 */
export const QUESTION_DONE_LINE = (question, option) => `- ${question} → **${option}**`;

/** 用户在反问卡片上点了「取消」时那张卡的标题。 */
export const QUESTION_CANCELLED_TITLE = '问题已取消';

/** 取消时卡片正文写的这句。 */
export const QUESTION_CANCELLED_TEXT = '这次提问已取消';

/** 这一轮结束了、问题作废时那张卡的标题。 */
export const QUESTION_CLOSED_TITLE = '问题已结束';

/** 问题作废时卡片正文写的这句。 */
export const QUESTION_ABORTED_TEXT = '这一轮已经结束了，问题作废';

/** 点到一张已经不认的反问卡片时回的话。 */
export const QUESTION_STALE_TEXT = '这个问题已经结束了';

/** 这批题飞书答不了时，回一句让人去网页端。 */
export const QUESTION_UNSUPPORTED_TEXT = '这题飞书答不了（没有选项或者是多选题），去网页端答吧';

/** 审批卡片的标题。 */
export const APPROVAL_CARD_TITLE = '需要你批准';

/** 审批卡片正文里写哪个工具要授权的那一行。 */
export const APPROVAL_TOOL_LINE = (toolName) => `**工具**：${toolName}`;

/** 审批卡片正文里那句：批准只对这一次生效。 */
export const APPROVAL_ONCE_NOTE = '允许只对这一次生效。';

/** 审批卡片的「允许」按钮。 */
export const APPROVAL_ALLOW_TEXT = '允许';

/** 审批卡片的「拒绝」按钮。 */
export const APPROVAL_REJECT_TEXT = '拒绝';

/** 批完允许之后那张卡的标题。 */
export const APPROVAL_ALLOWED_TITLE = '已允许';

/** 批完拒绝之后那张卡的标题。 */
export const APPROVAL_REJECTED_TITLE = '已拒绝';

/** 这一轮结束了、审批作废时那张卡的标题。 */
export const APPROVAL_CLOSED_TITLE = '审批已结束';

/** 审批作废时补在正文底下那句。 */
export const APPROVAL_ABORTED_TEXT = '这一轮已经结束了，审批作废';

/** 点到一张已经批过的审批卡片时回的话。 */
export const APPROVAL_STALE_TEXT = '这条审批已经处理过了';

/** 模型 / 推理深度 / 权限三张卡共用：没有当前会话就没得切。 */
export const NO_CURRENT_SESSION_TEXT = '还没有当前会话';

/** 没有会话控制器时的那句话。 */
export const SESSION_CONTROL_MISSING_TEXT = '没有会话控制器';

/** resolveAgent 成功但没给出会话句柄时的那句话。 */
export const SESSION_HANDLE_MISSING_TEXT = 'resolveAgent 没给出会话句柄';

/** 读不到当前值时的占位。 */
export const UNKNOWN_VALUE_TEXT = '(读不到)';

/** 模型卡片的标题。 */
export const MODEL_CARD_TITLE = '模型';

/** 模型卡片正文：现在是哪个、改完什么时候生效。 */
export const MODEL_CARD_SUMMARY = (label) => `现在是【${label}】。改完点确定。`;

/** 认不出当前模型时的模型卡片正文。 */
export const MODEL_CARD_UNKNOWN_TEXT = '读不到当前模型。改完点确定。';

/** 有几个服务商这次没读出来，接在模型卡片正文后面。 */
export const MODEL_CARD_FAILURES = (count) => `有 ${count} 个服务商这次没读出来。`;

/** 宿主一个可用模型都没有时，模型卡片的正文。 */
export const MODEL_CARD_EMPTY_TEXT = '宿主没有可用的模型。';

/** 提交完模型之后回的那句。 */
export const MODEL_REQUESTED_TEXT = (model, provider) =>
  `已请求：模型改成【${model}】（${provider}）。`;

/** 模型提交时顺带带过去的推理档位那一行。 */
export const MODEL_REQUESTED_EFFORT_TEXT = (effort) => `推理深度改成【${effort}】`;

/** 读不到模型目录时回的话。 */
export const MODEL_CATALOG_FAILED_TEXT = '读不到模型目录，重新打开模型卡片再试';

/** 选的那个模型不在目录里了，卡片重画时写回正文的话。 */
export const MODEL_GONE_ERROR = '这个模型已经不在可用目录里了，重新选一个';

/** 用户在模型卡片上点了「取消」时回的话。 */
export const MODEL_CANCELLED_TEXT = '模型选择已取消';

/** 点到一张已经不在册的模型卡片时回的话。 */
export const MODEL_STALE_TEXT = '这张卡片已失效，请重新打开模型卡片';

/** 会话控制器不支持切换模型时回的话。 */
export const MODEL_SELECT_UNSUPPORTED_TEXT = '会话控制器不支持切换模型';

/** 推理深度卡片的标题。 */
export const EFFORT_CARD_TITLE = '推理深度';

/** 推理深度当前档位认不出时显示成什么。 */
export const EFFORT_DEFAULT_LABEL = '(默认)';

/** 推理深度卡片正文：当前模型、现在是哪一档。 */
export const EFFORT_CARD_SUMMARY = (modelLabel, effortLabel) =>
  `当前模型【${modelLabel}】，推理深度【${effortLabel}】。改完点确定。`;

/** 当前会话的模型不在目录里时，推理深度卡片的正文。 */
export const EFFORT_NO_MODEL_TEXT = '当前会话用的模型不在可用目录里，先去「模型」卡片里选一个。';

/** 这个模型没有可选档位时，推理深度卡片的正文。 */
export const EFFORT_NO_TIERS_TEXT = (modelLabel) => `【${modelLabel}】没有可选的推理深度。`;

/** 提交完推理档位之后回的那句。 */
export const EFFORT_REQUESTED_TEXT = (label) => `已请求：推理深度改成【${label}】。`;

/** 这个模型没有这一档推理深度，卡片重画时写回正文的话。 */
export const EFFORT_GONE_ERROR = '这个模型没有这一档推理深度，重新选一个';

/** 用户在推理深度卡片上点了「取消」时回的话。 */
export const EFFORT_CANCELLED_TEXT = '推理深度选择已取消';

/** 点到一张已经不在册的推理深度卡片时回的话。 */
export const EFFORT_STALE_TEXT = '这张卡片已失效，请重新打开推理深度卡片';

/** 权限卡片的标题。 */
export const PERMISSION_CARD_TITLE = '权限';

/** 权限预设名的中文映射。 */
export const PERMISSION_PRESET_LABELS = {
  'read-only': '仅可查看',
  'workspace-write': '工作区内修改',
  'danger-full-access': '完全权限',
  custom: '自定义',
};

/** 权限卡片正文：现在是哪个预设。 */
export const PERMISSION_CARD_SUMMARY = (label) => `现在是【${label}】。改完点确定。`;

/** 宿主一个可用预设都没有时，权限卡片的正文。 */
export const PERMISSION_CARD_EMPTY_TEXT = '宿主没有可用的权限预设。';

/** 提交完权限之后回的那句。 */
export const PERMISSION_REQUESTED_TEXT = (label) => `已请求：权限改成【${label}】。`;

/** 卡片回传了部署里没有的预设时，卡片重画写回正文的话。 */
export const PERMISSION_UNKNOWN_PRESET_TEXT = (name) => `不认识的预设：${name}`;

/** 宿主没有权限预设服务时回的话。 */
export const PERMISSION_SERVICE_MISSING_TEXT = '没有权限预设服务';

/** 用户在权限卡片上点了「取消」时回的话。 */
export const PERMISSION_CANCELLED_TEXT = '权限选择已取消';

/** 点到一张已经不在册的权限卡片时回的话。 */
export const PERMISSION_STALE_TEXT = '这张卡片已失效，请重新打开权限卡片';

/** 会话设置被改了：模型已修改的标题。 */
export const SETTINGS_CHANGED_MODEL_TITLE = '模型已修改';
/** 会话设置被改了：权限已修改的标题。 */
export const SETTINGS_CHANGED_PERMISSION_TITLE = '权限已修改';

/** 会话设置被改了：模型改成了什么。 */
export const SETTINGS_CHANGED_MODEL = (name) => `模型改成【${name}】`;

/** 会话设置被改了：推理深度改成了什么。 */
export const SETTINGS_CHANGED_EFFORT = (name) => `推理深度改成【${name}】`;

/** 会话设置被改了：权限预设改成了什么。 */
export const SETTINGS_CHANGED_PERMISSION = (label) => `权限改成【${label}】`;

/** 会话设置事件里没带值、或者名字查不到时顶上去的字。 */
export const UNKNOWN_LABEL_TEXT = '(未知)';

/** 账户余额卡片的标题。 */
export const BALANCE_CARD_TITLE = '账户余额';

/** 余额卡片里余额那一行。 */
export const BALANCE_TOTAL_LINE = (text) => `余额：${text}`;

/** 余额卡片里充值链接那一行。 */
export const BALANCE_TOP_UP_LINE = (url) => `[去充值](${url})`;

/** 查不到余额时，余额卡片正文就这一句。 */
export const BALANCE_UNAVAILABLE_TEXT = '读不到账户余额，稍后再试';

/** 连上之后还没有当前会话时发的通告。 */
export const ANNOUNCE_NO_SESSION_TEXT = 'dsh 已连接，当前无会话';

/** 连上之后有当前会话时发的通告。 */
export const ANNOUNCE_SESSION_TEXT = (title) => `dsh 已连接，当前会话为【${title}】`;

/** 设置页解绑之后发给原 owner 的那张卡片的标题。 */
export const UNBOUND_TITLE = '已解绑';

/** 设置页解绑之后发给原 owner 的那张卡片的正文。 */
export const UNBOUND_TEXT = '飞书这边已经和 dsh 解绑了。想再用，点菜单「申请配对」重新配一次。';


