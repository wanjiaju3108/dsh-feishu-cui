/** 设置页的浏览器半边：在设置面板注册「飞书CUI会话」分区，显示并修改凭据、绑定状态、配对码与连接状态。 */

window.__ModuleLoader__.load({
  id: 'dsh-feishu-cui',
  factory: (require) => {
    /** 本插件的导出对象。 */
    const module = { exports: {} };
    /** 宿主提供的 React。 */
    const React = require('react');
    /** React.createElement 的简写。 */
    const h = React.createElement;

    /** 设置页路由前缀。 */
    const BASE_PATH = '/dsh-feishu-cui';
    /** 页面读状态的路径。 */
    const STATE_ROUTE = `${BASE_PATH}/state`;
    /** 页面保存飞书凭据的路径。 */
    const CREDENTIALS_ROUTE = `${BASE_PATH}/credentials`;
    /** 页面解绑当前 user 的路径。 */
    const UNBIND_USER_ROUTE = `${BASE_PATH}/user/unbind`;
    /** 页面开关防休眠的路径。 */
    const SLEEP_GUARD_ROUTE = `${BASE_PATH}/sleep-guard`;
    /** 分区文案用的 locale 命名空间。 */
    const LOCALE_NS = 'feishu-cui';
    /** 设置分区在设置页里的 id。 */
    const SECTION_ID = 'feishu-cui';

    /** 分区文案：中英各一份。 */
    const MESSAGES = {
      zh: {
        section: '飞书CUI会话',
        heading: '飞书CUI会话',
        'field.appId': 'App ID',
        'field.appSecret': 'App Secret',
        'hint.appSecret': '保存后不再回显；留空表示不改动。',
        'hint.appId': '飞书开发者后台 → 你的自建应用 → 凭据与基础信息。',
        'placeholder.appId': '输入 App ID',
        'placeholder.appSecret': '输入 App Secret',
        'placeholder.stored': '已配置——输入新值可替换',
        'placeholder.envLocked': '由启动环境提供（只读）',
        'button.save': '保存',
        'button.saving': '保存中…',
        'button.refresh': '刷新',
        'saved': '已保存，连接已按新凭据重建',
        'status.title': '状态',
        'status.connection': '连接状态',
        'status.configured': '已配置',
        'status.notConfigured': '未配置',
        'pairing.title': 'CUI会话绑定',
        'pairing.user': '绑定状态',
        'pairing.none': '未绑定',
        'pairing.code': '配对码',
        'pairing.hint': '更换绑定前需要解绑；申请配对在飞书菜单里',
        'pairing.unbind': '解绑',
        'pairing.unbound': '已解绑，去飞书里点「申请配对」拿新的配对码',
        'sleep.title': '插电合盖时不休眠',
        'sleep.active': '生效中',
        'sleep.on': '已开启',
        'sleep.off': '已关闭',
        'sleep.unsupported': '只在 macOS 上有效',
        'sleep.hint': '只在 macOS 上有效。打开后，插件跑着期间持有 caffeinate -s：插电时阻止系统休眠，合盖也不睡；拔电时这条断言不生效。',
        'error.loopbackOnly': '只允许本机访问',
        'error.methodOnly': '只接受 {method}',
        'error.bodyTooLarge': '请求体过大',
        'error.bodyNotJson': '请求体不是合法 JSON',
      },
      en: {
        section: 'Feishu CUI session',
        heading: 'Feishu CUI session',
        'field.appId': 'App ID',
        'field.appSecret': 'App Secret',
        'hint.appSecret': 'Not shown again after saving; leave blank to keep it.',
        'hint.appId': 'Feishu console → your custom app → credentials.',
        'placeholder.appId': 'Enter App ID',
        'placeholder.appSecret': 'Enter App Secret',
        'placeholder.stored': 'Configured — enter a new value to replace',
        'placeholder.envLocked': 'Provided by the environment (read-only)',
        'button.save': 'Save',
        'button.saving': 'Saving…',
        'button.refresh': 'Refresh',
        'saved': 'Saved; the connection was rebuilt',
        'status.title': 'Status',
        'status.connection': 'Connection status',
        'status.configured': 'configured',
        'status.notConfigured': 'not configured',
        'pairing.title': 'CUI session binding',
        'pairing.user': 'Binding',
        'pairing.none': 'not bound',
        'pairing.code': 'Pairing code',
        'pairing.hint': 'Unbind before switching the binding; request pairing from the Feishu menu',
        'pairing.unbind': 'Unbind',
        'pairing.unbound': 'Unbound; tap “Request pairing” in Feishu for a new code',
        'sleep.title': 'Stay awake on AC with the lid closed',
        'sleep.active': 'Active',
        'sleep.on': 'On',
        'sleep.off': 'Off',
        'sleep.unsupported': 'macOS only',
        'sleep.hint': 'macOS only. While on, the plugin holds caffeinate -s for as long as it runs: system sleep is blocked on AC power, lid closed included; the assertion does not apply on battery.',
        'error.loopbackOnly': 'Loopback requests only',
        'error.methodOnly': 'Only {method} is accepted',
        'error.bodyTooLarge': 'Request body is too large',
        'error.bodyNotJson': 'Request body is not valid JSON',
      },
    };

    /** 分区里各元素的内联样式。 */
    const styles = {
      group: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 0', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' },
      heading: { color: 'var(--dsw-alias-label-primary)', fontSize: '14px', lineHeight: '22px' },
      field: { display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '480px' },
      label: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '18px' },
      hint: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px' },
      input: {
        boxSizing: 'border-box',
        width: '100%',
        height: '32px',
        padding: '0 10px',
        borderRadius: '8px',
        border: '0.5px solid var(--dsw-alias-border-l4)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: '13px',
      },
      row: { display: 'flex', alignItems: 'center', gap: '8px' },
      button: {
        height: '32px',
        padding: '0 14px',
        borderRadius: '16px',
        border: 'none',
        cursor: 'pointer',
        background: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-label-primary-inverted)',
        font: 'inherit',
        fontSize: '13px',
      },
      buttonDisabled: {
        opacity: 0.4,
        cursor: 'not-allowed',
      },
      dot: { display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', marginLeft: '6px' },
      checkbox: { width: '16px', height: '16px', accentColor: 'var(--dsw-alias-label-primary)', cursor: 'pointer' },
      code: { color: 'var(--dsw-alias-label-primary)', fontSize: '14px', letterSpacing: '2px', fontFamily: 'monospace' },
      statusRow: { display: 'flex', gap: '8px', fontSize: '12px', lineHeight: '18px' },
      statusLabel: { color: 'var(--dsw-alias-label-tertiary)', minWidth: '96px' },
      statusValue: { color: 'var(--dsw-alias-label-secondary)', wordBreak: 'break-all' },
      error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: '12px', lineHeight: '18px' },
      iconButton: {
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        marginLeft: '4px',
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: 'var(--dsw-alias-label-tertiary)',
        cursor: 'pointer',
      },
      note: { color: 'var(--dsw-alias-state-success-primary)', fontSize: '12px', lineHeight: '18px' },
    };

    /**
     * 构造设置分区组件。
     *
     * @param t 文案函数
     * @returns React 组件
     */
    function createSection(t) {
      /**
       * 后端回的机器标记 → 这一页上给人看的话。
       *
       * @param payload 后端回的 JSON
       * @param status HTTP 状态码
       * @returns 错误文案
       */
      function failureText(payload, status) {
        if (payload?.error === 'loopback-only') return t('error.loopbackOnly');
        if (payload?.error === 'method-only') return t('error.methodOnly', { method: payload.method });
        if (payload?.error === 'body-too-large') return t('error.bodyTooLarge');
        if (payload?.error === 'body-not-json') return t('error.bodyNotJson');
        return payload?.error ?? `HTTP ${status}`;
      }

      /**
       * 画一行状态：左边 label，右边值。
       *
       * @param deps.label 左边那列的文字
       * @param deps.value 右边那列的值
       * @param deps.error 传 true 时值按错误样式画
       * @param deps.action 跟在 label 文字后面的元素；不传就只有文字
       * @returns 状态行元素
       */
      function StatusRow({ label, value, error, action }) {
        return h('div', { style: styles.statusRow }, [
          h('span', { key: 'l', style: styles.statusLabel }, action === undefined ? label : [label, action]),
          h('span', { key: 'v', style: error ? styles.error : styles.statusValue }, value),
        ]);
      }

      /**
       * 造 label 后面那个刷新按钮：点它重新拉一次状态。
       *
       * @param deps.onClick 点击时干什么
       * @returns 按钮元素
       */
      function RefreshButton({ onClick }) {
        return h('button', {
          type: 'button',
          title: t('button.refresh'),
          style: styles.iconButton,
          onClick,
        }, h(RefreshIcon));
      }

      /**
       * 画刷新图标（两个箭头）。
       *
       * @returns 图标元素
       */
      function RefreshIcon() {
        return h('svg', {
          width: 12,
          height: 12,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }, [
          h('path', { key: 'arc', d: 'M21 12a9 9 0 1 1-3-6.7' }),
          h('path', { key: 'head', d: 'M21 3v6h-6' }),
        ]);
      }

      /**
       * 画字段名，后面按需跟一个已配置 / 未配置的小点。
       *
       * @param deps.htmlFor 关联的 input id
       * @param deps.text 字段名
       * @param deps.configured 传布尔时画小点（true 绿、false 灰）；不传就不画
       * @returns label 元素
       */
      function FieldLabel({ htmlFor, text, configured }) {
        const dot = configured === undefined
          ? null
          : h('span', {
            key: 'dot',
            style: { ...styles.dot, background: configured ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-dimmed)' },
            title: configured ? t('status.configured') : t('status.notConfigured'),
          });
        return h('label', { key: 'label', style: styles.label, htmlFor }, [h('span', { key: 't' }, text), dot]);
      }

      /**
       * 画整个设置分区，挂载时取一次状态。
       *
       * @returns 分区元素
       */
      return function Section() {
        const [snapshot, setSnapshot] = React.useState(null);
        const [appId, setAppId] = React.useState('');
        const [appSecret, setAppSecret] = React.useState('');
        const [saving, setSaving] = React.useState(false);
        const [note, setNote] = React.useState('');
        const [error, setError] = React.useState('');
        /** 防休眠开关自己的错误行。 */
        const [sleepError, setSleepError] = React.useState('');
        /** 绑定区自己的提示行。 */
        const [pairingNote, setPairingNote] = React.useState('');
        const [pairingError, setPairingError] = React.useState('');

        /**
         * 取一次状态快照，填进组件状态；失败就填错误信息。
         */
        async function load() {
          try {
            const response = await fetch(STATE_ROUTE, { credentials: 'same-origin' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setSnapshot(await response.json());
            setError('');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }

        React.useEffect(() => {
          void load();
        }, []);

        /**
         * 提交 App ID / App Secret，成功后用回给的新快照刷新页面。
         */
        async function save() {
          setSaving(true);
          setNote('');
          setError('');
          try {
            const response = await fetch(CREDENTIALS_ROUTE, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ appId, appSecret }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(failureText(payload, response.status));
            setSnapshot(payload);
            setAppId('');
            setAppSecret('');
            setNote(t('saved'));
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setSaving(false);
          }
        }

        /**
         * 解绑当前 user，并用回给的新快照刷新页面。
         */
        async function unbindUser() {
          setPairingNote('');
          setPairingError('');
          try {
            const response = await fetch(UNBIND_USER_ROUTE, { method: 'POST', credentials: 'same-origin' });
            const payload = await response.json();
            if (!response.ok) throw new Error(failureText(payload, response.status));
            setSnapshot(payload);
            setPairingNote(t('pairing.unbound'));
          } catch (cause) {
            setPairingError(cause instanceof Error ? cause.message : String(cause));
          }
        }

        /**
         * 开关防休眠：把新值交给宿主，宿主那边立刻起或停 caffeinate，再用回给的新快照刷新页面。
         */
        async function toggleSleepGuard() {
          setSleepError('');
          try {
            const response = await fetch(SLEEP_GUARD_ROUTE, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ enabled: snapshot?.sleepGuard?.enabled !== true }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(failureText(payload, response.status));
            setSnapshot(payload);
          } catch (cause) {
            setSleepError(cause instanceof Error ? cause.message : String(cause));
          }
        }

        /** App ID 是不是已配置。 */
        const configured = snapshot?.appIdConfigured === true;
        /** App Secret 是不是已配置。 */
        const secretConfigured = snapshot?.appSecretConfigured === true;
        /**
         * 算输入框的 placeholder 文案。
         *
         * @param isConfigured 这一项配没配
         * @param writable 这一项能不能写；false 表示由环境提供
         * @param emptyText 没配置时用的文案
         * @returns placeholder 文案
         */
        const placeholder = (isConfigured, writable, emptyText) => {
          if (isConfigured && writable === false) return t('placeholder.envLocked');
          if (isConfigured) return t('placeholder.stored');
          return emptyText;
        };

        /** 保存按钮的禁用条件：正在保存，或者两项都没填。 */
        const saveDisabled = saving || (appId.trim() === '' && appSecret.trim() === '');
        /** 解绑按钮的禁用条件：还没有绑定的人。 */
        const unbindDisabled = !snapshot?.userId;
        /**
         * 按禁用与否取按钮样式。
         *
         * @param disabled 是不是禁用
         * @returns 样式对象
         */
        const buttonStyle = (disabled) => (disabled ? { ...styles.button, ...styles.buttonDisabled } : styles.button);

        return h('div', { style: styles.group }, [
          h('div', { key: 'h', style: styles.heading }, t('heading')),

          h('div', { key: 'appId', style: styles.field }, [
            h(FieldLabel, { key: 'l', htmlFor: 'feishu-cui-app-id', text: t('field.appId'), configured }),
            h('input', {
              key: 'in',
              id: 'feishu-cui-app-id',
              style: styles.input,
              value: appId,
              placeholder: placeholder(configured, snapshot?.appIdWritable, t('placeholder.appId')),
              onChange: (event) => setAppId(event.target.value),
            }),
            h('div', { key: 'hint', style: styles.hint }, t('hint.appId')),
          ]),

          h('div', { key: 'secret', style: styles.field }, [
            h(FieldLabel, { key: 'l', htmlFor: 'feishu-cui-app-secret', text: t('field.appSecret'), configured: secretConfigured }),
            h('input', {
              key: 'in',
              id: 'feishu-cui-app-secret',
              type: 'password',
              style: styles.input,
              value: appSecret,
              placeholder: placeholder(secretConfigured, snapshot?.appSecretWritable, t('placeholder.appSecret')),
              onChange: (event) => setAppSecret(event.target.value),
            }),
            h('div', { key: 'hint', style: styles.hint }, t('hint.appSecret')),
          ]),

          h('div', { key: 'actions', style: styles.row }, [
            h('button', {
              key: 'save',
              type: 'button',
              style: buttonStyle(saveDisabled),
              disabled: saveDisabled,
              onClick: () => void save(),
            }, saving ? t('button.saving') : t('button.save')),
          ]),
          note !== '' ? h('div', { key: 'note', style: styles.note }, note) : null,
          error !== '' ? h('div', { key: 'error', style: styles.error }, error) : null,

          h('div', { key: 'pairingTitle', style: styles.heading }, t('pairing.title')),
          h(StatusRow, {
            key: 'user',
            label: t('pairing.user'),
            action: h(RefreshButton, { key: 'refresh', onClick: () => void load() }),
            value: snapshot?.userId || t('pairing.none'),
            error: !snapshot?.userId,
          }),
          h(StatusRow, {
            key: 'code',
            label: t('pairing.code'),
            action: h(RefreshButton, { key: 'refresh', onClick: () => void load() }),
            value: snapshot?.pairingCode || '—',
          }),
          h('div', { key: 'pairingHint', style: styles.hint }, t('pairing.hint')),
          h('div', { key: 'pairingActions', style: styles.row }, [
            h('button', {
              key: 'unbind',
              type: 'button',
              style: buttonStyle(unbindDisabled),
              disabled: unbindDisabled,
              onClick: () => void unbindUser(),
            }, t('pairing.unbind')),
          ]),
          pairingNote !== '' ? h('div', { key: 'pairingNote', style: styles.note }, pairingNote) : null,
          pairingError !== '' ? h('div', { key: 'pairingError', style: styles.error }, pairingError) : null,

          h(StatusRow, {
            key: 'sleepGuard',
            label: t('sleep.title'),
            action: h('input', {
              type: 'checkbox',
              style: styles.checkbox,
              disabled: snapshot?.sleepGuard?.supported !== true,
              checked: snapshot?.sleepGuard?.enabled === true,
              onChange: () => void toggleSleepGuard(),
            }),
            value: sleepStateText(snapshot?.sleepGuard, t),
          }),
          h('div', { key: 'sleepHint', style: styles.hint }, t('sleep.hint')),
          snapshot?.sleepGuard?.error
            ? h('div', { key: 'sleepGuardError', style: styles.error }, snapshot.sleepGuard.error)
            : null,
          sleepError !== '' ? h('div', { key: 'sleepActionError', style: styles.error }, sleepError) : null,

          h('div', { key: 'statusTitle', style: styles.heading }, t('status.title')),
          h(StatusRow, {
            key: 'connection',
            label: t('status.connection'),
            value: h('span', {
              style: {
                ...styles.dot,
                background: snapshot?.connected
                  ? 'var(--dsw-alias-state-success-primary)'
                  : 'var(--dsw-alias-state-error-primary)',
              },
            }),
          }),
        ]);
      };
    }

    /** 防休眠那一行的状态文案。 */
    function sleepStateText(guard, t) {
      if (!guard || guard.supported !== true) return t('sleep.unsupported');
      if (guard.enabled !== true) return t('sleep.off');
      return guard.holding ? t('sleep.active') : t('sleep.on');
    }

    /**
     * 客户端插件入口：注册 locale 文案，并把设置分区挂到 settings.section 槽位。
     *
     * @param ctx 客户端 Cordis 上下文
     */
    function apply(ctx) {
      const slots = ctx.get('slots');
      if (slots === undefined) return;
      const locale = ctx.get('locale');

      if (locale !== undefined) {
        try {
          ctx.effect(() => {
            const disposes = [
              locale.register(LOCALE_NS, 'zh', MESSAGES.zh),
              locale.register(LOCALE_NS, 'en', MESSAGES.en),
            ];
            return () => {
              for (const dispose of disposes) dispose();
            };
          });
        } catch (error) {
          console.warn('feishu-cui: locale registration failed', error);
        }
      }

      /** 文案函数：宿主 locale 可用时用它的，否则退回中文文案。 */
      const t = locale !== undefined
        ? locale.bind(LOCALE_NS)
        : (key) => MESSAGES.zh[key] ?? key;

      /** 这个分区组件。 */
      const Section = createSection(t);

      /**
       * 包一层 Section：语言切换时重渲染一次。
       *
       * @returns 分区元素
       */
      function LocaleAwareSection() {
        const [, bump] = React.useReducer((value) => value + 1, 0);
        React.useEffect(() => {
          if (locale === undefined) return undefined;
          return locale.subscribe(() => bump());
        }, []);
        return h(Section);
      }

      slots.inject('settings.section', () => slots.register({
        name: 'settings.section',
        id: SECTION_ID,
        order: 172,
        label: () => t('section'),
      }, LocaleAwareSection));
    }

    module.exports.apply = apply;
    module.exports.inject = ['slots'];
    return module.exports;
  },
});
