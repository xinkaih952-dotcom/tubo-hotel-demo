/* =================================================================
 * 演示模式（只在演示版加载）
 *   1. 改用独立的存储键名，不会碰到真实版本在同一台电脑上的数据
 *   2. 第一次打开时，自动填入上个月和本月的示例每日记录、交班记录
 *   3. 页面顶部显示「演示版」提示，并提供「重置演示数据」
 * ================================================================= */

(() => {
  // 1. 独立存储
  const DEMO_KEYS = {
    LEDGER_KEY: 'tubo_demo_ledger_v1',
    SHIFT_KEY: 'tubo_demo_shifts_v1',
    COST_KEY: 'tubo_demo_costs_v1',
    IMPORT_KEY: 'tubo_demo_imported_v1'
  };
  Object.assign(CONFIG, DEMO_KEYS);
  const SEEDED_KEY = 'tubo_demo_seeded_v1';

  // 2. 第一次打开时填入示例记录
  function seed() {
    const records = DemoGen.dailyRecords().map(RecordModel.normalize);
    const shifts = DemoGen.dailyShifts(records, DESK_KEYS).map(ShiftStore.normalize);
    Utils.writeJSON(CONFIG.LEDGER_KEY, { version: 2, savedAt: new Date().toISOString(), records });
    Utils.writeJSON(CONFIG.SHIFT_KEY, { version: 1, savedAt: new Date().toISOString(), shifts });
    Utils.writeJSON(SEEDED_KEY, { at: new Date().toISOString() });
  }
  if (!Utils.readJSON(SEEDED_KEY)) seed();

  function resetDemo() {
    Object.values(DEMO_KEYS).forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ } });
    seed();
    location.reload();
  }

  // 3. 顶部提示
  const main = document.querySelector('main');
  if (main) {
    const bar = document.createElement('div');
    bar.className = 'banner info';
    bar.style.display = 'flex';
    bar.style.flexWrap = 'wrap';
    bar.style.gap = '6px 16px';
    bar.style.alignItems = 'center';
    bar.style.justifyContent = 'space-between';
    bar.innerHTML = '<span><b>演示版</b>：页面上的所有数字都是虚构的，只用来展示功能。你在这里录入的内容只保存在你自己的浏览器里，别人看不到。</span>'
      + '<button type="button" class="btn btn-sm" id="btnDemoReset">重置演示数据</button>';
    main.insertBefore(bar, main.firstChild);
    bar.querySelector('#btnDemoReset').addEventListener('click', resetDemo);
  }

  // 演示版在前台页也放一个去收支利润页的入口，方便参观
  const meta = document.querySelector('.topbar-meta');
  if (meta && !meta.querySelector('a[href="finance.html"]') && !meta.querySelector('a[href="index.html"]')) {
    const a = document.createElement('a');
    a.href = 'finance.html';
    a.textContent = '收支利润（店长页）→';
    meta.appendChild(a);
  }
})();
