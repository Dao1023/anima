// dsh-anima 浏览器半边:侧栏"任务"入口 + 主面板(嵌入 maid-dashboard)
window.__ModuleLoader__.load({
  id: 'dsh-anima',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // 任务清单图标(剪贴板+勾选)
    function TaskIcon({ active }) {
      const c = active ? '#9c6bb3' : 'currentColor';
      return h('svg', {
        viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': true,
        fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, [
        h('rect', { x: 4, y: 3, width: 16, height: 18, rx: 2 }),
        h('path', { d: 'M8 8l1.5 1.5L12.5 6.5' }),
        h('path', { d: 'M8 14l1.5 1.5L12.5 12.5' }),
        h('path', { d: 'M15 8.5h2M15 15h2' }),
      ]);
    }

    // 主面板:iframe 嵌本地看板(单一事实源,前端更新无需动这里)
    function Panel() {
      return h('iframe', {
        src: 'http://127.0.0.1:3741',
        style: { width: '100%', height: '100%', border: 'none', background: '#f5f6f8' },
        title: '女仆任务面板',
      });
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // main 是 keyed 槽:key = panellist 条目的 id,两者对上点击才能选中
        ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: 'anima-tasks' },
          Panel,
        ));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: 'anima-tasks', order: 50, label: '任务' },
          TaskIcon,
        ));
      },
    };
  },
});
