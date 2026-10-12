/* =================================================================
 * 涂泊酒店（南宁东站店）· 共用代码
 * 前台「营收台账」(index.html) 和店长「收支利润」(finance.html) 都会加载本文件
 * 包含：全局配置、收入/收款/成本项目、工具函数、每日记录与交班记录的存取、月度汇总
 * ================================================================= */

/* -----------------------------------------------------------------
 * 一、全局配置（以后要改酒店名称、客房数、渠道，只改这里）
 * ----------------------------------------------------------------- */
const CONFIG = {
  HOTEL_NAME: '涂泊酒店',
  BRANCH_NAME: '南宁东站店',
  TOTAL_ROOMS: 68,                              // 总客房数（间）
  LEDGER_KEY: 'tubo_hotel_ledger_v2',           // 每日营收记录的存储键名（请勿修改）
  SHIFT_KEY: 'tubo_hotel_shifts_v1',            // 交班收款记录的存储键名（请勿修改）
  COST_KEY: 'tubo_hotel_costs_v1',              // 月度成本的存储键名（收支利润页用）
  IMPORT_KEY: 'tubo_hotel_imported_v1',         // 导入的前台 Excel 数据（收支利润页用）
  OCC_HIGH: 0.85,                               // 入住率 ≥ 85% 绿色
  OCC_MID: 0.6                                  // 60%–85% 黄色，低于 60% 红色
};

/*
 * 房费收入渠道（与酒店利润表「一、主营业务收入（房费）」一致）
 *   active: false → 前台录入表里不再显示，但历史数据照常统计
 *   atDesk: true  → 这笔钱由前台收取，参与交班对账
 */
const ROOM_CHANNELS = [
  { key: 'revPos',     label: '门店POS机', atDesk: true },
  { key: 'revCash',    label: '门店现金',  atDesk: true },
  { key: 'revCtrip',   label: '携程' },
  { key: 'revMeituan', label: '美团' },
  { key: 'revFliggy',  label: '飞猪' },
  { key: 'revDouyin',  label: '抖音' },
  { key: 'revHuatuo',  label: '华佗代理', active: false }
];

/* 非房费收入（与利润表「五、非主营业务收入」一致） */
const NON_ROOM_ITEMS = [
  { key: 'revStore',     label: '前台便利店', atDesk: true },
  { key: 'revGoods',     label: '小商品',     hint: '复印、拖鞋、税点等', atDesk: true },
  { key: 'revBreakfast', label: '餐厅早餐',   atDesk: true },
  { key: 'revKiosk',     label: '自助机提现', hint: '客房商品' },
  { key: 'revOther',     label: '其他收入',   atDesk: true }
];

/* 交班收款方式（要加「银行卡」等，在这里加一行即可） */
const PAYMENT_METHODS = [
  { key: 'payWechat', label: '微信' },
  { key: 'payAlipay', label: '支付宝' },
  { key: 'payCash',   label: '现金' },
  { key: 'payCredit', label: '挂账', hint: '未收到的款' }
];

/* 班次 */
const SHIFTS = [
  { key: 'early', label: '早班' },
  { key: 'late',  label: '晚班' }
];

const ROOM_KEYS = ROOM_CHANNELS.map(c => c.key);
const NON_ROOM_KEYS = NON_ROOM_ITEMS.map(c => c.key);
const ALL_REV_KEYS = [...ROOM_KEYS, ...NON_ROOM_KEYS];
const DESK_KEYS = [...ROOM_CHANNELS, ...NON_ROOM_ITEMS].filter(c => c.atDesk).map(c => c.key);
const PAY_KEYS = PAYMENT_METHODS.map(p => p.key);

/*
 * 月度成本项目（与酒店利润表结构一致，收支利润页使用）
 *   cat：成本结构饼图里归入的大类；negative：抵减项（如利息收入）
 */
const COST_GROUPS = [
  { id: 'ctrl', label: '可控费用', section: 'mainCost', items: [
    { key: 'costSupplies',     label: '客房低值易耗品', hint: '矿泉水、拖鞋、沐浴露等', cat: 'supplies' },
    { key: 'costLaundry',      label: '洗涤费（布草）', cat: 'laundry' },
    { key: 'costRestaurant',   label: '餐厅成本（菜款）', cat: 'goods' },
    { key: 'costWater',        label: '商铺水费', cat: 'utility' },
    { key: 'costPower',        label: '商铺电费', cat: 'utility' },
    { key: 'costPowerExhibit', label: '流动展区电费', cat: 'utility' },
    { key: 'costPowerSign',    label: '广告招牌电费', cat: 'utility' }
  ] },
  { id: 'nonctrl', label: '非可控费用', section: 'mainCost', items: [
    { key: 'costRentShop',        label: '商铺租金', cat: 'rent' },
    { key: 'costPropertyShop',    label: '商铺物业费', cat: 'rent' },
    { key: 'costRentExhibit',     label: '流动展区租金', cat: 'rent' },
    { key: 'costPropertyExhibit', label: '流动展区物业费', cat: 'rent' },
    { key: 'costRentToll',        label: '收费室租金物业', cat: 'rent' }
  ] },
  { id: 'sales', label: '销售费用', section: 'expense', items: [
    { key: 'costWageMgmt',     label: '管理人员工资', cat: 'labor' },
    { key: 'costWageFront',    label: '前台员工工资', cat: 'labor' },
    { key: 'costWageRoom',     label: '客房员工工资', cat: 'labor' },
    { key: 'costWageSecurity', label: '保安员工工资', cat: 'labor' },
    { key: 'costWageKitchen',  label: '厨房员工工资', cat: 'labor' },
    { key: 'costBonus',        label: '员工奖励', cat: 'labor' },
    { key: 'costAgency',       label: '中介点评服务', cat: 'other' }
  ] },
  { id: 'admin', label: '管理费用', section: 'expense', items: [
    { key: 'costOffice',    label: '办公费', cat: 'other' },
    { key: 'costUniform',   label: '工装费', cat: 'other' },
    { key: 'costEntertain', label: '业务招待费', cat: 'other' },
    { key: 'costGarbage',   label: '垃圾清理费', cat: 'other' },
    { key: 'costWelfare',   label: '职工福利费', cat: 'labor' },
    { key: 'costMedical',   label: '单位医保', cat: 'labor' },
    { key: 'costSocial',    label: '单位社保', cat: 'labor' },
    { key: 'costNetwork',   label: '网络系统服务费', cat: 'other' },
    { key: 'costSysMaint',  label: '系统维护服务费', cat: 'other' },
    { key: 'costPest',      label: '消杀费', cat: 'other' },
    { key: 'costRepair',    label: '维修费', cat: 'other' },
    { key: 'costAir',       label: '空气检测费', cat: 'other' }
  ] },
  { id: 'fin', label: '财务费用', section: 'expense', items: [
    { key: 'costBankFee',    label: '银行手续费', cat: 'other' },
    { key: 'costService',    label: '服务费', cat: 'other' },
    { key: 'incomeInterest', label: '利息收入', hint: '抵减', cat: 'other', negative: true }
  ] },
  { id: 'tax', label: '税金及附加', section: 'expense', items: [
    { key: 'costTax', label: '税金及附加', cat: 'other' }
  ] },
  { id: 'nonmain', label: '非主营业务成本', section: 'nonMainCost', items: [
    { key: 'costStoreCogs',       label: '便利店销售成本', cat: 'goods' },
    { key: 'costGoodsCogs',       label: '小商品成本', cat: 'goods' },
    { key: 'costStoreCommission', label: '便利店提成', cat: 'labor' }
  ] },
  { id: 'below', label: '摊销及其他', section: 'below', items: [
    { key: 'costPreopening', label: '开办费摊销', hint: '投建长期费用', cat: 'preopening' },
    { key: 'costOtherExp',   label: '其他支出', cat: 'other' }
  ] }
];
const COST_ITEMS = COST_GROUPS.flatMap(g => g.items.map(i => Object.assign({ group: g.id }, i)));
const COST_KEYS = COST_ITEMS.map(i => i.key);

/* 成本结构饼图的大类（颜色按固定顺序分配） */
const COST_CATEGORIES = [
  { id: 'rent',       label: '房租物业',     color: 'var(--cat-1)' },
  { id: 'labor',      label: '人力成本',     color: 'var(--cat-2)' },
  { id: 'preopening', label: '开办费摊销',   color: 'var(--cat-3)' },
  { id: 'goods',      label: '商品及餐饮成本', color: 'var(--cat-4)' },
  { id: 'utility',    label: '水电',         color: 'var(--cat-5)' },
  { id: 'laundry',    label: '布草洗涤',     color: 'var(--cat-6)' },
  { id: 'supplies',   label: '客房耗材',     color: 'var(--cat-7)' },
  { id: 'other',      label: '其他费用',     color: 'var(--cat-8)' }
];

/* -----------------------------------------------------------------
 * 二、工具函数
 * ----------------------------------------------------------------- */
const Utils = {
  round2: n => Math.round((Number(n) + Number.EPSILON) * 100) / 100,
  money: n => Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  /** 金额简写：28.1万 */
  moneyShort(n) {
    const a = Math.abs(n);
    if (a >= 10000) return (n / 10000).toFixed(a >= 100000 ? 1 : 2).replace(/\.?0+$/, '') + '万';
    return Math.round(n).toLocaleString('zh-CN');
  },
  percent: (ratio, d = 1) => (ratio * 100).toFixed(d) + '%',
  dateStr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  today: () => Utils.dateStr(new Date()),
  thisMonth: () => Utils.today().slice(0, 7),
  parseDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); },
  weekday: str => '周' + '日一二三四五六'[Utils.parseDate(str).getDay()],
  dateCn(str) { const [y, m, d] = str.split('-'); return `${y}年${Number(m)}月${Number(d)}日`; },
  dateShort(str) { const [, m, d] = str.split('-'); return `${Number(m)}月${Number(d)}日`; },
  monthCn(str) { const [y, m] = str.split('-'); return `${y}年${Number(m)}月`; },
  daysInMonth(month) { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); },
  prevYearMonth(month) { const [y, m] = month.split('-'); return `${Number(y) - 1}-${m}`; },
  prevMonth(month) { const [y, m] = month.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; },
  uid: () => 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
  escape(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  sum: (obj, keys) => Utils.round2(keys.reduce((s, k) => s + (Number(obj[k]) || 0), 0)),
  /** 安全读写 localStorage */
  readJSON(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  },
  writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  },
  storageAvailable() {
    try { const k = '__tubo_test__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; }
    catch (e) { return false; }
  },
  /** 读取金额输入框：空着视为 0；不能为负；最多两位小数 */
  readAmount(input, allowNegative) {
    if (input.validity && input.validity.badInput) return { ok: false, msg: '请输入有效的数字' };
    const raw = input.value.trim();
    if (raw === '') return { ok: true, value: 0 };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, msg: '请输入有效的数字' };
    if (n < 0 && !allowNegative) return { ok: false, msg: '金额不能为负数' };
    if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) return { ok: false, msg: '最多保留两位小数' };
    if (Math.abs(n) > 100000000) return { ok: false, msg: '金额过大，请检查' };
    return { ok: true, value: Utils.round2(n) };
  },
  /** 计算美观的刻度（支持负数） */
  niceTicks(min, max, count = 4) {
    const span = Math.max(max - min, 1);
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw);
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return ticks;
  }
};

/** 涨跌标签。type：'pp' 百分点；'pct' 百分比；invert：数值越小越好（如成本） */
function deltaChip(now, prev, type, invert) {
  if (now === null || now === undefined || prev === null || prev === undefined) return '';
  if (type === 'pct' && prev === 0) return '';
  const diff = type === 'pp' ? (now - prev) * 100 : (now - prev) / Math.abs(prev) * 100;
  let cls = Math.abs(diff) < 0.05 ? 'flat' : (diff > 0 ? 'up' : 'down');
  const arrow = cls === 'up' ? '▲' : (cls === 'down' ? '▼' : '');
  if (invert && cls !== 'flat') cls = cls === 'up' ? 'down' : 'up';
  const text = type === 'pp' ? `${Math.abs(diff).toFixed(1)} 个百分点` : `${Math.abs(diff).toFixed(1)}%`;
  return `<span class="delta ${cls}">${arrow} ${text}</span>`;
}

/** 底部提示 */
let __toastTimer = null;
function showToast(msg, isError) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.toggle('is-error', !!isError);
  t.hidden = false;
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 5000 : 3000);
}

/* Excel 下载：在 Claude 页面里用 Claude 的下载功能，直接打开时由浏览器下载 */
const downloadsReady = (window.claude && typeof window.claude.use === 'function')
  ? window.claude.use('downloads').catch(() => null)
  : Promise.resolve(null);

async function saveWorkbook(wb, filename) {
  const downloads = await downloadsReady;
  if (downloads) {
    try {
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      await downloads.save({ filename, data: new Blob([buf]) });
      showToast(`已导出 ${filename}`);
    } catch (err) {
      const code = err && err.code;
      if (code === 'declined') showToast('已取消导出');
      else if (code === 'rate_limited') showToast('上一个导出还在确认中，请稍后再试', true);
      else showToast('当前页面无法下载文件，请用浏览器直接打开本页面后导出', true);
    }
  } else {
    XLSX.writeFile(wb, filename);
    showToast(`已导出 ${filename}`);
  }
}

/** 给工作表的数字单元格设置格式 */
function formatSheetNumbers(ws, fromRow, toRow, fromCol, toCol, pctCols) {
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = fromCol; c <= toCol; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.z = (pctCols || []).includes(c) ? '0.0%' : '#,##0.00';
    }
  }
}

/* -----------------------------------------------------------------
 * 三、每日营收记录
 * ----------------------------------------------------------------- */
const RecordModel = {
  blank() {
    const r = { id: '', date: '', roomSold: 0, adr: 0 };
    ALL_REV_KEYS.forEach(k => { r[k] = 0; });
    Object.assign(r, { revenueRoom: 0, revenueNonRoom: 0, revenueTotal: 0, remark: '' });
    return r;
  },
  recalc(r) {
    r.revenueRoom = Utils.sum(r, ROOM_KEYS);
    r.revenueNonRoom = Utils.sum(r, NON_ROOM_KEYS);
    r.revenueTotal = Utils.round2(r.revenueRoom + r.revenueNonRoom);
    return r;
  },
  normalize(raw) {
    const r = Object.assign(RecordModel.blank(), raw);
    ['roomSold', 'adr', ...ALL_REV_KEYS].forEach(k => { r[k] = Number(r[k]) || 0; });
    r.remark = String(r.remark || '');
    if (!r.id) r.id = Utils.uid();
    return RecordModel.recalc(r);
  },
  occupancy: r => r.roomSold / CONFIG.TOTAL_ROOMS,
  revpar: r => r.adr * RecordModel.occupancy(r),
  /** 前台应收（参与交班对账的收入合计） */
  deskReceivable: r => Utils.sum(r, DESK_KEYS),
  occLevel(ratio) {
    if (ratio >= CONFIG.OCC_HIGH) return 'high';
    if (ratio >= CONFIG.OCC_MID) return 'mid';
    return 'low';
  }
};

/*
 * 每日营收存储
 *   setExtra()：收支利润页导入的前台 Excel 记录，与本机记录合并（同一天以本机为准）
 */
const LedgerStore = (() => {
  let records = [];
  let extra = [];
  let persistent = true;

  function load() {
    persistent = Utils.storageAvailable();
    let raw = null;
    try { raw = localStorage.getItem(CONFIG.LEDGER_KEY); } catch (e) { raw = null; }
    if (!raw) { records = []; return; }
    try {
      const data = JSON.parse(raw);
      records = (Array.isArray(data) ? data : (data.records || [])).map(RecordModel.normalize);
    } catch (e) {
      try { localStorage.setItem(CONFIG.LEDGER_KEY + '_corrupt_' + Date.now(), raw); } catch (e2) { /* 忽略 */ }
      records = [];
    }
  }
  function persist() {
    persistent = Utils.writeJSON(CONFIG.LEDGER_KEY, { version: 2, savedAt: new Date().toISOString(), records });
    return persistent;
  }
  /** 本机记录 + 导入记录（去重） */
  function merged() {
    if (!extra.length) return records;
    const own = new Set(records.map(r => r.date));
    return records.concat(extra.filter(r => !own.has(r.date)));
  }

  return {
    load,
    isPersistent: () => persistent,
    setExtra(list) { extra = list.map(RecordModel.normalize); },
    all: () => merged().slice(),
    own: () => records.slice(),
    byId: id => records.find(r => r.id === id) || null,
    byDate: date => merged().find(r => r.date === date) || null,
    byMonth: month => merged().filter(r => r.date.slice(0, 7) === month).sort((a, b) => b.date.localeCompare(a.date)),
    latest() {
      const today = Utils.today();
      return records.filter(r => r.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    },
    months: () => [...new Set(merged().map(r => r.date.slice(0, 7)))],
    upsert(record) {
      const i = records.findIndex(r => r.id === record.id);
      if (i >= 0) records[i] = record; else records.push(record);
      return persist();
    },
    remove(id) { records = records.filter(r => r.id !== id); return persist(); }
  };
})();

/* -----------------------------------------------------------------
 * 四、交班收款记录（每天早班、晚班各一条）
 * ----------------------------------------------------------------- */
const ShiftStore = (() => {
  let shifts = [];
  function normalize(raw) {
    const s = Object.assign({ id: '', date: '', shift: 'early', staff: '', remark: '' }, raw);
    PAY_KEYS.forEach(k => { s[k] = Number(s[k]) || 0; });
    s.total = Utils.sum(s, PAY_KEYS);
    if (!s.id) s.id = Utils.uid();
    return s;
  }
  function persist() {
    return Utils.writeJSON(CONFIG.SHIFT_KEY, { version: 1, savedAt: new Date().toISOString(), shifts });
  }
  return {
    normalize,
    load() {
      const data = Utils.readJSON(CONFIG.SHIFT_KEY);
      shifts = data && Array.isArray(data.shifts) ? data.shifts.map(normalize) : [];
    },
    all: () => shifts.slice(),
    get: (date, shift) => shifts.find(s => s.date === date && s.shift === shift) || null,
    byDate: date => shifts.filter(s => s.date === date),
    byMonth: month => shifts.filter(s => s.date.slice(0, 7) === month)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.shift === 'early' ? -1 : 1)),
    upsert(s) {
      const i = shifts.findIndex(x => x.date === s.date && x.shift === s.shift);
      if (i >= 0) { s.id = shifts[i].id; shifts[i] = s; } else shifts.push(s);
      return persist();
    },
    remove(date, shift) { shifts = shifts.filter(s => !(s.date === date && s.shift === shift)); return persist(); }
  };
})();

/** 某一天的交班对账结果 */
function reconcile(date) {
  const rec = LedgerStore.byDate(date);
  const list = ShiftStore.byDate(date);
  const collected = Utils.round2(list.reduce((s, x) => s + x.total, 0));
  const receivable = rec ? RecordModel.deskReceivable(rec) : null;
  const has = k => list.some(s => s.shift === k);
  let status;
  if (!list.length) status = 'none';
  else if (!has('early') || !has('late')) status = 'partial';
  else if (receivable === null) status = 'norecord';
  else status = Math.abs(collected - receivable) < 0.005 ? 'ok' : 'diff';
  return {
    status, collected, receivable, shifts: list,
    diff: receivable === null ? null : Utils.round2(collected - receivable),
    missing: SHIFTS.filter(s => !has(s.key)).map(s => s.label)
  };
}

/** 对账状态小标签 */
function reconChip(r) {
  if (r.status === 'ok') return '<span class="recon ok">✓ 已平</span>';
  if (r.status === 'diff') return `<span class="recon diff">✕ 差 ${r.diff > 0 ? '+' : '−'}¥${Utils.money(Math.abs(r.diff))}</span>`;
  if (r.status === 'partial') return `<span class="recon wait">缺${r.missing.join('、')}</span>`;
  if (r.status === 'norecord') return '<span class="recon wait">缺营收</span>';
  return '<span class="recon wait">未交班</span>';
}

/* -----------------------------------------------------------------
 * 五、月度营收汇总（历史利润表 + 每日台账，统一口径）
 *   入住率 = 入住间夜 ÷ 可售间夜；平均房价按间夜加权；RevPAR = 平均房价 × 入住率
 * ----------------------------------------------------------------- */
const HISTORY_DATA = (typeof HISTORY !== 'undefined' && Array.isArray(HISTORY)) ? HISTORY : [];

const Monthly = {
  historyMap: Object.fromEntries(HISTORY_DATA.map(h => [h.month, h])),

  fromRecords(month, list) {
    const days = list.length;
    const sold = list.reduce((s, r) => s + r.roomSold, 0);
    const adrWeighted = list.reduce((s, r) => s + r.adr * r.roomSold, 0);
    const m = { month, source: 'ledger', days, fullDays: Utils.daysInMonth(month), sold, avail: days * CONFIG.TOTAL_ROOMS };
    ALL_REV_KEYS.forEach(k => { m[k] = Utils.round2(list.reduce((s, r) => s + r[k], 0)); });
    m.lastDate = list.length ? list.map(r => r.date).sort().pop() : null;
    return Monthly.finish(m, sold > 0 ? adrWeighted / sold : null);
  },
  fromHistory(h) {
    const m = Object.assign({ source: 'history', days: Utils.daysInMonth(h.month), fullDays: Utils.daysInMonth(h.month) }, h);
    ALL_REV_KEYS.forEach(k => { m[k] = Number(m[k]) || 0; });
    return Monthly.finish(m, h.adr);
  },
  finish(m, adr) {
    m.adr = adr;
    m.revenueRoom = Utils.sum(m, ROOM_KEYS);
    m.revenueNonRoom = Utils.sum(m, NON_ROOM_KEYS);
    m.revenueTotal = Utils.round2(m.revenueRoom + m.revenueNonRoom);
    m.occ = m.avail > 0 ? m.sold / m.avail : null;
    m.revpar = adr !== null && m.occ !== null ? adr * m.occ : null;
    m.partial = m.days < m.fullDays;
    m.dailyRoom = m.days > 0 ? m.revenueRoom / m.days : null;
    m.dailyNonRoom = m.days > 0 ? m.revenueNonRoom / m.days : null;
    return m;
  },
  /** 利润表有的月份用利润表，其余用每日台账；都没有返回 null */
  get(month) {
    if (Monthly.historyMap[month]) return Monthly.fromHistory(Monthly.historyMap[month]);
    const list = LedgerStore.byMonth(month);
    return list.length ? Monthly.fromRecords(month, list) : null;
  },
  allMonths() {
    return [...new Set([...HISTORY_DATA.map(h => h.month), ...LedgerStore.months()])].sort();
  },
  /** 多个月合计（全年用），全部加权 */
  combine(list) {
    const sold = list.reduce((s, m) => s + m.sold, 0);
    const avail = list.reduce((s, m) => s + m.avail, 0);
    const adrW = list.reduce((s, m) => s + (m.adr || 0) * m.sold, 0);
    const c = { sold, avail, days: list.reduce((s, m) => s + m.days, 0) };
    ALL_REV_KEYS.forEach(k => { c[k] = Utils.round2(list.reduce((s, m) => s + m[k], 0)); });
    c.fullDays = c.days;
    return Monthly.finish(c, sold > 0 ? adrW / sold : null);
  }
};

/* -----------------------------------------------------------------
 * 六、页眉通用：酒店名称、今天日期
 * ----------------------------------------------------------------- */
function fillHeader() {
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const today = Utils.today();
  set('hotelName', CONFIG.HOTEL_NAME);
  set('branchName', CONFIG.BRANCH_NAME);
  set('todayLabel', `${Utils.dateCn(today)} ${Utils.weekday(today)}`);
  set('totalRoomsLabel', CONFIG.TOTAL_ROOMS);
}
