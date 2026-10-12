/* =================================================================
 * 涂泊酒店（南宁东站店）· 每日营收台账（前台页面）
 * 依赖：data.js（历史月度营收，可缺省）、common.js（配置与共用代码）
 * 功能：每日营收录入、交班收款与对账、每日记录列表、同比、月度对比图、导出 Excel
 * ================================================================= */

/* -----------------------------------------------------------------
 * 一、页面元素与状态
 * ----------------------------------------------------------------- */
const $ = id => document.getElementById(id);
const ACTIVE_ROOM = ROOM_CHANNELS.filter(c => c.active !== false);
const ACTIVE_NON_ROOM = NON_ROOM_ITEMS.filter(c => c.active !== false);
const ACTIVE_KEYS = [...ACTIVE_ROOM, ...ACTIVE_NON_ROOM].map(c => c.key);

const el = {
  form: $('revenueForm'), date: $('fDate'), roomSold: $('fRoomSold'), adr: $('fAdr'), remark: $('fRemark'),
  dateNote: $('dateNote'), adrHelp: $('adrHelp'), submit: $('btnSubmit'),
  editBanner: $('editBanner'), editBannerText: $('editBannerText'),
  shiftForm: $('shiftForm'), sDate: $('sDate'), sStaff: $('sStaff'), sRemark: $('sRemark'),
  filterMonth: $('filterMonth'), list: $('listContainer'), monthSummary: $('monthSummary'),
  money: {},   // 收入输入框
  pay: {}      // 收款方式输入框
};
const state = {
  editingId: null,   // 正在编辑的营收记录
  shift: 'early',    // 交班页签当前班次
  metric: 'occ',     // 月度对比图指标
  year: null
};

/* -----------------------------------------------------------------
 * 二、生成输入框（按 common.js 里的配置）
 * ----------------------------------------------------------------- */
function moneyField(c, prefix) {
  return `
    <div class="field">
      <label for="${prefix}${c.key}">${c.label}${c.hint ? `<span class="hint">${c.hint}</span>` : ''}</label>
      <div class="money"><input class="input" type="number" id="${prefix}${c.key}" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></div>
      <p class="field-error" data-error-for="${prefix}${c.key}"></p>
    </div>`;
}

function buildFields() {
  $('roomChannelFields').innerHTML = ACTIVE_ROOM.map(c => moneyField(c, 'f_')).join('');
  $('nonRoomFields').innerHTML = ACTIVE_NON_ROOM.map(c => moneyField(c, 'f_')).join('');
  ACTIVE_KEYS.forEach(k => { el.money[k] = $('f_' + k); });

  $('payFields').innerHTML = PAYMENT_METHODS.map(p => moneyField(p, 's_')).join('');
  PAY_KEYS.forEach(k => { el.pay[k] = $('s_' + k); });

  $('shiftSeg').innerHTML = SHIFTS.map(s =>
    `<button type="button" data-shift="${s.key}" aria-pressed="${s.key === state.shift}">${s.label}</button>`).join('');

  $('deskItemsNote').textContent = [...ROOM_CHANNELS, ...NON_ROOM_ITEMS].filter(c => c.atDesk).map(c => c.label).join(' + ');
}

/* -----------------------------------------------------------------
 * 三、页签切换
 * ----------------------------------------------------------------- */
function switchTab(name) {
  const daily = name === 'daily';
  $('tabDaily').setAttribute('aria-selected', daily);
  $('tabShift').setAttribute('aria-selected', !daily);
  $('paneDaily').hidden = !daily;
  $('paneShift').hidden = daily;
}

/* -----------------------------------------------------------------
 * 四、渲染：营业日指标卡
 * ----------------------------------------------------------------- */
function renderDashboard() {
  const today = Utils.today();
  const rec = LedgerStore.latest();
  const isToday = rec && rec.date === today;
  const dayLabel = !rec || isToday ? '今日' : Utils.dateShort(rec.date);

  $('statsHint').textContent = !rec ? '还没有记录'
    : (isToday ? `营业日：${Utils.dateCn(today)} ${Utils.weekday(today)}`
               : `今日尚未录入，显示最近营业日 ${Utils.dateCn(rec.date)} ${Utils.weekday(rec.date)}`);
  $('statRevenueLabel').textContent = `${dayLabel}总营收`;
  $('statOccLabel').textContent = `${dayLabel}入住率`;
  $('statAdrLabel').textContent = `${dayLabel}平均房价`;
  $('statReconLabel').textContent = `${dayLabel}交班对账`;

  if (rec) {
    const occ = RecordModel.occupancy(rec);
    $('statTodayRevenue').innerHTML = `<span class="cur">¥</span>${Utils.money(rec.revenueTotal)}`;
    $('statTodayFoot').textContent = `房费 ¥${Utils.money(rec.revenueRoom)} · 非房费 ¥${Utils.money(rec.revenueNonRoom)}`;
    $('statTodayFoot').classList.remove('pending');
    $('statTodayOcc').innerHTML = `${(occ * 100).toFixed(1)}<span class="unit">%</span>`;
    $('statOccFoot').textContent = `已售 ${rec.roomSold} / ${CONFIG.TOTAL_ROOMS} 间 · RevPAR ¥${Utils.money(RecordModel.revpar(rec))}`;
    $('statTodayAdr').innerHTML = rec.roomSold > 0 ? `<span class="cur">¥</span>${Utils.money(rec.adr)}` : '—';

    const r = reconcile(rec.date);
    $('statRecon').innerHTML = reconChip(r).replace('class="recon', 'style="font-size:1.0625rem" class="recon');
    $('statReconFoot').textContent = r.status === 'none'
      ? `前台应收 ¥${Utils.money(r.receivable)}，还没有交班记录`
      : `收款 ¥${Utils.money(r.collected)} / 应收 ¥${Utils.money(r.receivable)}`;
  } else {
    ['statTodayRevenue', 'statTodayOcc', 'statTodayAdr', 'statRecon'].forEach(id => { $(id).textContent = '—'; });
    $('statTodayFoot').textContent = '在下方录入第一天的数据';
    $('statTodayFoot').classList.add('pending');
    $('statOccFoot').textContent = `出租间数 ÷ ${CONFIG.TOTAL_ROOMS} 间`;
    $('statReconFoot').textContent = '早班 + 晚班收款 对比 前台应收';
  }

  const month = Utils.thisMonth();
  const list = LedgerStore.byMonth(month);
  const mtd = list.length ? Monthly.fromRecords(month, list) : null;
  $('statMonthRevenue').innerHTML = `<span class="cur">¥</span>${Utils.money(mtd ? mtd.revenueTotal : 0)}`;
  $('statMonthFoot').textContent = `${Utils.monthCn(month)} · 已录入 ${list.length} 天`;
}

/* -----------------------------------------------------------------
 * 五、渲染：本月至今 vs 去年同月
 * ----------------------------------------------------------------- */
function renderYoy() {
  const month = Utils.thisMonth();
  const prevMonth = Utils.prevYearMonth(month);
  const list = LedgerStore.byMonth(month);
  const now = list.length ? Monthly.fromRecords(month, list) : null;
  const prev = Monthly.get(prevMonth);
  $('yoyHint').textContent = `${Utils.monthCn(month)} 对比 ${Utils.monthCn(prevMonth)}`;

  const items = [
    { k: '入住率', f: m => m.occ, fmt: v => Utils.percent(v), type: 'pp' },
    { k: '平均房价', f: m => m.adr, fmt: v => '¥' + Utils.money(v), type: 'pct' },
    { k: 'RevPAR', f: m => m.revpar, fmt: v => '¥' + Utils.money(v), type: 'pct' },
    { k: '日均房费收入', f: m => m.dailyRoom, fmt: v => '¥' + Utils.money(v), type: 'pct' },
    { k: '日均非房费收入', f: m => m.dailyNonRoom, fmt: v => '¥' + Utils.money(v), type: 'pct' }
  ];
  $('yoyGrid').innerHTML = items.map(it => {
    const v = now ? it.f(now) : null;
    const p = prev ? it.f(prev) : null;
    return `<div class="yoy-item"><span class="k">${it.k}</span>
      <span class="v">${v === null ? '—' : it.fmt(v)}</span>
      <span class="p">去年 ${p === null ? '—' : it.fmt(p)} ${deltaChip(v, p, it.type)}</span></div>`;
  }).join('');

  $('yoyNote').textContent = !prev ? `没有 ${Utils.monthCn(prevMonth)} 的数据，无法对比。`
    : (!now ? `本月还没有录入记录。去年同月数据来自利润表（全月 ${prev.days} 天）。`
            : `本月已录入 ${now.days} 天（截至 ${Utils.dateShort(now.lastDate)}），去年同月为全月 ${prev.days} 天。收入用日均对比。`);
}

/* -----------------------------------------------------------------
 * 六、渲染：每日记录列表
 * ----------------------------------------------------------------- */
function renderList() {
  const month = el.filterMonth.value || Utils.thisMonth();
  const list = LedgerStore.byMonth(month);
  const today = Utils.today();
  const s = list.length ? Monthly.fromRecords(month, list) : null;
  const recons = list.map(r => reconcile(r.date));
  const okDays = recons.filter(r => r.status === 'ok').length;
  const diffDays = recons.filter(r => r.status === 'diff').length;

  el.monthSummary.innerHTML = s ? `
    <span>${Utils.monthCn(month)}</span>
    <span>录入 <b>${s.days}</b> 天</span>
    <span>总营收 <b>¥${Utils.money(s.revenueTotal)}</b></span>
    <span>入住率 <b>${Utils.percent(s.occ)}</b></span>
    <span>平均房价 <b>${s.adr === null ? '—' : '¥' + Utils.money(s.adr)}</b></span>
    <span>对账已平 <b>${okDays}</b> 天${diffDays ? `，有差额 <b style="color:var(--bad)">${diffDays}</b> 天` : ''}</span>`
    : `<span>${Utils.monthCn(month)}</span><span>暂无每日记录</span>`;

  $('exportFileName').textContent = exportFileName(month);

  if (!list.length) {
    const hist = Monthly.historyMap[month];
    el.list.innerHTML = `<div class="empty"><p class="empty-title">${Utils.monthCn(month)}没有每日记录</p>
      <p>${hist ? '这个月的数据来自利润表，只有月度合计，可以在下方「月度对比」里查看。'
                : '在左侧「每日营收」填写出租间数、平均房价和各渠道收入，点「保存营收」后，这里会按日期列出每一天。'}</p></div>`;
    return;
  }

  const rows = list.map((r, i) => {
    const occ = RecordModel.occupancy(r);
    const lv = RecordModel.occLevel(occ);
    return `
      <tr class="${r.id === state.editingId ? 'is-editing' : ''}">
        <td class="date-cell"><span class="num">${r.date.slice(5).replace('-', '/')}</span><span class="wd">${Utils.weekday(r.date)}</span>${r.date === today ? '<span class="tag">今天</span>' : ''}</td>
        <td class="r num">${r.roomSold}</td>
        <td><span class="occ lv-${lv}"><span class="occ-bar"><i style="width:${(Math.min(occ, 1) * 100).toFixed(1)}%"></i></span><span class="occ-pill">${Utils.percent(occ)}</span></span></td>
        <td class="r money-cell">${r.roomSold > 0 ? '¥' + Utils.money(r.adr) : '—'}</td>
        <td class="r money-cell">¥${Utils.money(r.revenueRoom)}</td>
        <td class="r money-cell">¥${Utils.money(r.revenueNonRoom)}</td>
        <td class="r money-cell total">¥${Utils.money(r.revenueTotal)}</td>
        <td><button type="button" class="btn-link" style="text-decoration:none" data-action="recon" data-date="${r.date}" title="打开交班收款">${reconChip(recons[i])}</button></td>
        <td class="remark-cell" title="${Utils.escape(r.remark)}">${r.remark ? Utils.escape(r.remark) : '—'}</td>
        <td class="actions-cell">
          <button type="button" class="btn btn-sm" data-action="edit" data-id="${r.id}">编辑</button>
          <button type="button" class="btn btn-sm" data-action="delete" data-id="${r.id}">删除</button>
        </td>
      </tr>`;
  }).join('');

  el.list.innerHTML = `
    <div class="table-scroll"><table class="grid-table records">
      <thead><tr><th>日期</th><th class="r">出租间数</th><th>入住率</th><th class="r">平均房价</th>
        <th class="r">房费</th><th class="r">非房费</th><th class="r">总营收</th><th>交班对账</th><th>备注</th><th class="r">操作</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

/* -----------------------------------------------------------------
 * 七、月度对比：折线图 + 汇总表
 * ----------------------------------------------------------------- */
const METRICS = [
  { key: 'occ',            label: '入住率',     fmt: v => Utils.percent(v),     axis: v => Math.round(v * 100) + '%', fixedMax: 1 },
  { key: 'adr',            label: '平均房价',   fmt: v => '¥' + Utils.money(v), axis: v => '¥' + Math.round(v) },
  { key: 'revpar',         label: 'RevPAR',     fmt: v => '¥' + Utils.money(v), axis: v => '¥' + Math.round(v) },
  { key: 'revenueRoom',    label: '房费收入',   fmt: v => '¥' + Utils.money(v), axis: v => Utils.moneyShort(v), total: true },
  { key: 'revenueNonRoom', label: '非房费收入', fmt: v => '¥' + Utils.money(v), axis: v => Utils.moneyShort(v), total: true },
  { key: 'revenueTotal',   label: '总营收',     fmt: v => '¥' + Utils.money(v), axis: v => Utils.moneyShort(v), total: true }
];

function renderMetricControls() {
  $('metricSeg').innerHTML = METRICS.map(m =>
    `<button type="button" data-metric="${m.key}" aria-pressed="${m.key === state.metric}">${m.label}</button>`).join('');
  const years = [...new Set(Monthly.allMonths().map(m => m.slice(0, 4)))].sort().reverse();
  if (!state.year || !years.includes(state.year)) state.year = years[0];
  $('yearSelect').innerHTML = years.map(y => `<option value="${y}" ${y === state.year ? 'selected' : ''}>${y} 年 vs ${y - 1} 年</option>`).join('');
}

function renderChart() {
  const metric = METRICS.find(m => m.key === state.metric);
  const year = Number(state.year);
  const series = [
    { year, color: 'var(--series-now)' },
    { year: year - 1, color: 'var(--series-prev)' }
  ].map(s => {
    s.points = [];
    for (let m = 1; m <= 12; m++) {
      const sum = Monthly.get(`${s.year}-${String(m).padStart(2, '0')}`);
      let v = sum ? sum[metric.key] : null;
      // 收入合计类指标：未录满的月份只是部分天数，不画在图上，只在提示框显示
      const partialTotal = !!(metric.total && sum && sum.partial);
      if (partialTotal) v = null;
      s.points.push({ m, sum, partialTotal, v: v === null || v === undefined ? null : v });
    }
    s.hasData = s.points.some(p => p.v !== null || p.partialTotal);
    return s;
  }).filter(s => s.hasData);

  const hasPartial = series.some(s => s.points.some(p => p.sum && p.sum.partial));
  $('chartLegend').innerHTML = series.map(s => `<span><i style="background:${s.color}"></i>${s.year} 年</span>`).join('')
    + (hasPartial && !metric.total ? '<span><i class="hollow"></i>空心点：当月未录满，按已录入天数计算</span>' : '')
    + (hasPartial && metric.total ? '<span>未录满的月份不画在图上，鼠标移到该月可看已录入部分</span>' : '');

  const svg = $('trendChart');
  const wrap = $('chartWrap');
  const W = Math.max(320, wrap.clientWidth - 28);
  const H = W < 560 ? 250 : 300;
  const pad = { l: 56, r: 58, t: 16, b: 30 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if (!series.length) { svg.innerHTML = ''; return; }

  const maxV = metric.fixedMax || Math.max(1, ...series.flatMap(s => s.points.map(p => p.v || 0)));
  const ticks = metric.fixedMax ? [0, 0.25, 0.5, 0.75, 1] : Utils.niceTicks(0, maxV);
  const yMax = ticks[ticks.length - 1];
  const x = m => pad.l + (m - 1) * (iw / 11);
  const y = v => pad.t + ih - (v / yMax) * ih;

  let out = '';
  ticks.forEach(t => {
    out += `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" stroke-width="1"/>`;
    out += `<text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${metric.axis(t)}</text>`;
  });
  for (let m = 1; m <= 12; m++) {
    if (W < 560 && m % 2 === 0) continue;
    out += `<text x="${x(m)}" y="${H - 8}" text-anchor="middle">${m}月</text>`;
  }
  out += `<line id="crosshair" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>`;

  series.slice().reverse().forEach(s => {
    let d = '', pen = false;
    s.points.forEach(p => {
      if (p.v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(p.m).toFixed(1)},${y(p.v).toFixed(1)}`;
      pen = true;
    });
    out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.points.forEach(p => {
      if (p.v === null) return;
      const hollow = p.sum && p.sum.partial;
      out += `<circle cx="${x(p.m)}" cy="${y(p.v)}" r="4" fill="${hollow ? 'var(--surface)' : s.color}" stroke="${hollow ? s.color : 'var(--surface)'}" stroke-width="2"/>`;
    });
    const last = s.points.filter(p => p.v !== null).pop();
    if (last) out += `<text class="end-label" x="${x(last.m) + 8}" y="${y(last.v) + 4}">${s.year}</text>`;
  });
  for (let m = 1; m <= 12; m++) {
    out += `<rect class="hit" data-m="${m}" x="${x(m) - iw / 22}" y="${pad.t}" width="${iw / 11}" height="${ih}" fill="transparent"/>`;
  }
  svg.innerHTML = out;

  const tip = $('chartTip');
  const cross = svg.querySelector('#crosshair');
  svg.querySelectorAll('.hit').forEach(rect => {
    rect.addEventListener('mouseenter', () => {
      const m = Number(rect.dataset.m);
      const rows = series.map(s => {
        const p = s.points[m - 1];
        const note = p.sum && p.sum.partial ? `（${p.sum.days} 天）` : '';
        const shown = p.partialTotal ? p.sum[metric.key] : p.v;
        return `<div class="r"><span><i class="line" style="background:${s.color}"></i>${s.year} 年${note}</span><b>${shown === null || shown === undefined ? '—' : metric.fmt(shown)}</b></div>`;
      }).join('');
      const a = series[0] && series[0].points[m - 1].v;
      const b = series[1] && series[1].points[m - 1].v;
      const delta = series.length === 2 && a !== null && b !== null ? `<div class="n">同比 ${deltaChip(a, b, metric.key === 'occ' ? 'pp' : 'pct')}</div>` : '';
      const notes = series.map(s => s.points[m - 1].sum && s.points[m - 1].sum.note).filter(Boolean)
        .map(n => `<div class="n">⚠ ${Utils.escape(n)}</div>`).join('');
      tip.innerHTML = `<div class="t">${m} 月 · ${metric.label}</div>${rows}${delta}${notes}`;
      tip.hidden = false;
      cross.setAttribute('x1', x(m)); cross.setAttribute('x2', x(m)); cross.setAttribute('visibility', 'visible');
      const scale = svg.getBoundingClientRect().width / W;
      const left = x(m) * scale + 14;
      const tipW = tip.offsetWidth;
      tip.style.left = (left + tipW + 24 > wrap.clientWidth ? left - tipW - 24 : left + 12) + 'px';
      tip.style.top = (pad.t * scale + 8) + 'px';
    });
    rect.addEventListener('mouseleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  });
}

function renderMonthlyTable() {
  const byYear = {};
  Monthly.allMonths().forEach(m => { (byYear[m.slice(0, 4)] = byYear[m.slice(0, 4)] || []).push(m); });
  const head = `<thead><tr><th>月份</th><th>来源</th><th class="r">可售间夜</th><th class="r">入住间夜</th><th class="r">入住率</th>
    <th class="r">平均房价</th><th class="r">RevPAR</th><th class="r">房费收入</th><th class="r">非房费收入</th>
    <th class="r">总营收</th><th class="r">RevPAR 同比</th></tr></thead>`;
  const row = (label, s, src, prev, cls = '') => `
    <tr class="${cls}"><td class="date-cell">${label}</td><td class="src">${src}</td>
      <td class="r num">${s.avail.toLocaleString('zh-CN')}</td><td class="r num">${s.sold.toLocaleString('zh-CN')}</td>
      <td class="r num">${s.occ === null ? '—' : Utils.percent(s.occ)}</td>
      <td class="r money-cell">${s.adr === null ? '—' : '¥' + Utils.money(s.adr)}</td>
      <td class="r money-cell">${s.revpar === null ? '—' : '¥' + Utils.money(s.revpar)}</td>
      <td class="r money-cell">¥${Utils.money(s.revenueRoom)}</td><td class="r money-cell">¥${Utils.money(s.revenueNonRoom)}</td>
      <td class="r money-cell total">¥${Utils.money(s.revenueTotal)}</td>
      <td class="r">${prev ? deltaChip(s.revpar, prev.revpar, 'pct') : '<span class="src">—</span>'}</td></tr>`;
  let body = '';
  Object.keys(byYear).sort().reverse().forEach(year => {
    const sums = byYear[year].map(Monthly.get).filter(Boolean);
    body += `<tr class="year-head"><td colspan="11">${year} 年</td></tr>`;
    sums.slice().reverse().forEach(s => {
      const src = s.source === 'history' ? '利润表' : `每日台账 · ${s.days}/${s.fullDays} 天`;
      const warn = s.note ? `<span class="tag warn" title="${Utils.escape(s.note)}">待核对</span>` : '';
      body += row(`${Number(s.month.slice(5))} 月${warn}`, s, src, Monthly.get(Utils.prevYearMonth(s.month)));
    });
    body += row(`${year} 年合计`, Monthly.combine(sums), `${sums.length} 个月 · 加权`, null, 'year-row');
  });
  $('monthlyTable').innerHTML = head + `<tbody>${body}</tbody>`;
}

function renderTrend() { renderMetricControls(); renderChart(); renderMonthlyTable(); }

function renderAll() {
  renderDashboard();
  renderYoy();
  renderList();
  renderTrend();
  renderReconBox();
  $('storageBanner').hidden = LedgerStore.isPersistent();
}

/* -----------------------------------------------------------------
 * 八、每日营收表单
 * ----------------------------------------------------------------- */
function setFieldError(input, msg) {
  const p = document.querySelector(`[data-error-for="${input.id}"]`);
  if (p) p.textContent = msg || '';
  input.classList.toggle('has-error', !!msg);
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
function clearErrors(inputs) { inputs.forEach(i => setFieldError(i, '')); }
const dailyInputs = () => [el.date, el.roomSold, el.adr, ...Object.values(el.money)];

function readRoomSold(input) {
  if (input.validity && input.validity.badInput) return { ok: false, msg: '请输入有效的数字' };
  const raw = input.value.trim();
  if (raw === '') return { ok: false, msg: '请填写（没有出租请填 0）' };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { ok: false, msg: '不能为负数' };
  if (!Number.isInteger(n)) return { ok: false, msg: '必须是整数' };
  if (n > CONFIG.TOTAL_ROOMS) return { ok: false, msg: `不能超过 ${CONFIG.TOTAL_ROOMS} 间` };
  return { ok: true, value: n };
}

function readDailyForm() {
  clearErrors(dailyInputs());
  let ok = true, firstBad = null;
  const fail = (input, msg) => { setFieldError(input, msg); ok = false; if (!firstBad) firstBad = input; };

  const date = el.date.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(el.date, '请选择营业日期');
  const rs = readRoomSold(el.roomSold);
  if (!rs.ok) fail(el.roomSold, rs.msg);
  const adrRes = Utils.readAmount(el.adr);
  if (!adrRes.ok) fail(el.adr, adrRes.msg);
  else if (rs.ok && rs.value > 0 && adrRes.value === 0) fail(el.adr, '有出租时请填写系统平均房价');

  const amounts = {};
  ACTIVE_KEYS.forEach(k => {
    const res = Utils.readAmount(el.money[k]);
    if (!res.ok) fail(el.money[k], res.msg); else amounts[k] = res.value;
  });
  if (ok && state.editingId) {
    const other = LedgerStore.byDate(date);
    if (other && other.id !== state.editingId) fail(el.date, `${Utils.dateCn(date)}已有另一条记录，请先删除或编辑那一条`);
  }
  if (!ok) { firstBad.focus(); return null; }
  return Object.assign({ date, roomSold: rs.value, adr: rs.value > 0 ? adrRes.value : 0, remark: el.remark.value.trim() }, amounts);
}

function updateLiveTotal() {
  const val = k => { const n = Number(el.money[k] ? el.money[k].value : 0); return Number.isFinite(n) && n > 0 ? n : 0; };
  const room = Utils.round2(ACTIVE_ROOM.reduce((s, c) => s + val(c.key), 0));
  const non = Utils.round2(ACTIVE_NON_ROOM.reduce((s, c) => s + val(c.key), 0));
  const desk = Utils.round2(DESK_KEYS.reduce((s, k) => s + val(k), 0));
  $('liveRoom').textContent = $('subRoom').textContent = '¥' + Utils.money(room);
  $('liveNonRoom').textContent = $('subNonRoom').textContent = '¥' + Utils.money(non);
  $('liveDesk').textContent = '¥' + Utils.money(desk);
  $('liveTotal').textContent = '¥' + Utils.money(room + non);
  const sold = Number(el.roomSold.value);
  el.adrHelp.textContent = sold > 0 && room > 0
    ? `房费合计 ÷ 出租间数 = ¥${Utils.money(room / sold)}（仅供核对，以系统数为准）`
    : '房费合计 ÷ 出租间数 = —（仅供核对）';
}

function updateDateNote() {
  const rec = el.date.value ? LedgerStore.byDate(el.date.value) : null;
  el.dateNote.textContent = rec && rec.id !== state.editingId
    ? (state.editingId ? '该日期已有另一条记录，不能改到这一天。' : '该日期已有记录，保存后会覆盖原记录。可在右侧点「编辑」查看原数据。')
    : '';
}

function resetDailyForm() {
  el.form.reset();
  el.date.value = Utils.today();
  state.editingId = null;
  el.editBanner.hidden = true;
  el.submit.textContent = '保存营收';
  clearErrors(dailyInputs());
  updateLiveTotal();
  updateDateNote();
  renderList();
}

function fillDailyForm(rec) {
  switchTab('daily');
  clearErrors(dailyInputs());
  state.editingId = rec.id;
  el.date.value = rec.date;
  el.roomSold.value = rec.roomSold;
  el.adr.value = rec.adr || '';
  ACTIVE_KEYS.forEach(k => { el.money[k].value = rec[k] ? rec[k] : ''; });
  el.remark.value = rec.remark;
  el.editBanner.hidden = false;
  el.editBannerText.textContent = `正在编辑：${Utils.dateCn(rec.date)} ${Utils.weekday(rec.date)}`;
  el.submit.textContent = '保存修改';
  updateLiveTotal();
  updateDateNote();
  renderList();
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('tabDaily').scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' });
  el.roomSold.focus({ preventScroll: true });
}

function handleDailySubmit(e) {
  e.preventDefault();
  const data = readDailyForm();
  if (!data) return;
  const existing = state.editingId ? LedgerStore.byId(state.editingId) : LedgerStore.byDate(data.date);
  const wasOverwrite = !state.editingId && !!existing;
  // 以旧记录为底（保留已停用渠道的历史金额），再写入表单数据
  const record = RecordModel.recalc(Object.assign(RecordModel.blank(), existing || {}, data, { id: existing ? existing.id : Utils.uid() }));
  const saved = LedgerStore.upsert(record);
  el.filterMonth.value = record.date.slice(0, 7);
  resetDailyForm();
  renderAll();
  if (!saved) showToast('已记录，但浏览器无法长期保存，请尽快导出 Excel', true);
  else if (wasOverwrite) showToast(`已覆盖 ${Utils.dateCn(record.date)} 的营收记录`);
  else showToast(`已保存 ${Utils.dateCn(record.date)}，当日总营收 ¥${Utils.money(record.revenueTotal)}`);
}

/* -----------------------------------------------------------------
 * 九、交班收款表单
 * ----------------------------------------------------------------- */
const shiftLabel = key => (SHIFTS.find(s => s.key === key) || {}).label || key;

/** 按日期 + 班次读入已有记录（没有则清空金额） */
function loadShift() {
  const date = el.sDate.value;
  const s = date ? ShiftStore.get(date, state.shift) : null;
  PAY_KEYS.forEach(k => { el.pay[k].value = s && s[k] ? s[k] : ''; });
  el.sStaff.value = s ? s.staff : '';
  el.sRemark.value = s ? s.remark : '';
  clearErrors([el.sDate, ...Object.values(el.pay)]);
  $('shiftNote').textContent = s ? `${Utils.dateShort(date)}${shiftLabel(state.shift)}已有记录，修改后点「更新交班」。` : '';
  $('btnShiftSubmit').textContent = s ? '更新交班' : '保存交班';
  $('btnShiftDelete').hidden = !s;
  resetDeleteShift();
  $('shiftSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.shift === state.shift));
  updateShiftTotal();
}

function updateShiftTotal() {
  const total = PAY_KEYS.reduce((s, k) => { const n = Number(el.pay[k].value); return s + (Number.isFinite(n) && n > 0 ? n : 0); }, 0);
  $('shiftSub').textContent = '¥' + Utils.money(total);
  renderReconBox(Utils.round2(total));
}

/** 当日对账框：以表单里正在填的本班金额实时预览 */
function renderReconBox(currentTotal) {
  const date = el.sDate.value;
  const box = $('reconBox');
  if (!date) { box.innerHTML = ''; return; }
  const rec = LedgerStore.byDate(date);
  const receivable = rec ? RecordModel.deskReceivable(rec) : null;
  const amounts = SHIFTS.map(s => {
    if (s.key === state.shift && currentTotal !== undefined) return { s, v: currentTotal, live: true };
    const x = ShiftStore.get(date, s.key);
    return { s, v: x ? x.total : null };
  });
  const collected = Utils.round2(amounts.reduce((t, a) => t + (a.v || 0), 0));
  const allIn = amounts.every(a => a.v !== null);
  let resultRow;
  if (receivable === null) {
    resultRow = '<div class="row"><span>前台应收</span><b>当天还没有录营收</b></div>';
  } else {
    const diff = Utils.round2(collected - receivable);
    const cls = !allIn ? '' : (Math.abs(diff) < 0.005 ? 'good' : 'bad');
    const txt = !allIn ? `还差 ¥${Utils.money(receivable - collected)}（${amounts.filter(a => a.v === null).map(a => a.s.label).join('、')}未交）`
      : (Math.abs(diff) < 0.005 ? '✓ 已平' : `${diff > 0 ? '多收' : '少收'} ¥${Utils.money(Math.abs(diff))}`);
    resultRow = `<div class="row"><span>前台应收（${Utils.dateShort(date)}营收）</span><b>¥${Utils.money(receivable)}</b></div>
      <div class="row total ${cls}"><span>对账结果</span><b>${txt}</b></div>`;
  }
  box.innerHTML = amounts.map(a =>
    `<div class="row"><span>${a.s.label}${a.live ? '（正在填写）' : ''}</span><b>${a.v === null ? '未交班' : '¥' + Utils.money(a.v)}</b></div>`).join('')
    + `<div class="row"><span>两班合计</span><b>¥${Utils.money(collected)}</b></div>` + resultRow;
}

function handleShiftSubmit(e) {
  e.preventDefault();
  const inputs = [el.sDate, ...Object.values(el.pay)];
  clearErrors(inputs);
  let ok = true, firstBad = null;
  const fail = (input, msg) => { setFieldError(input, msg); ok = false; if (!firstBad) firstBad = input; };
  const date = el.sDate.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(el.sDate, '请选择营业日期');
  const data = { date, shift: state.shift, staff: el.sStaff.value.trim(), remark: el.sRemark.value.trim() };
  PAY_KEYS.forEach(k => {
    const res = Utils.readAmount(el.pay[k]);
    if (!res.ok) fail(el.pay[k], res.msg); else data[k] = res.value;
  });
  if (!ok) { firstBad.focus(); return; }

  const existed = !!ShiftStore.get(date, state.shift);
  const s = ShiftStore.normalize(data);
  const saved = ShiftStore.upsert(s);
  loadShift();
  renderAll();
  if (!saved) showToast('已记录，但浏览器无法长期保存，请尽快导出 Excel', true);
  else showToast(`${existed ? '已更新' : '已保存'} ${Utils.dateShort(date)}${shiftLabel(state.shift)}交班，本班收款 ¥${Utils.money(s.total)}`);
}

/* 删除本班：点两次确认 */
let shiftDeleteTimer = null;
function resetDeleteShift() {
  const b = $('btnShiftDelete');
  b.dataset.armed = '';
  b.textContent = '删除本班记录';
  b.style.color = '';
  clearTimeout(shiftDeleteTimer);
}
function handleShiftDelete() {
  const b = $('btnShiftDelete');
  if (b.dataset.armed !== '1') {
    b.dataset.armed = '1';
    b.textContent = '再点一次确认删除';
    b.style.color = 'var(--bad)';
    shiftDeleteTimer = setTimeout(resetDeleteShift, 4000);
    return;
  }
  const date = el.sDate.value;
  ShiftStore.remove(date, state.shift);
  showToast(`已删除 ${Utils.dateShort(date)}${shiftLabel(state.shift)}交班记录`);
  loadShift();
  renderAll();
}

/** 从列表打开某天的交班页签：优先打开还没交的班次 */
function openShift(date) {
  switchTab('shift');
  el.sDate.value = date;
  const missing = SHIFTS.find(s => !ShiftStore.get(date, s.key));
  state.shift = missing ? missing.key : SHIFTS[0].key;
  loadShift();
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('tabShift').scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' });
}

/* -----------------------------------------------------------------
 * 十、列表操作：编辑 / 删除 / 打开对账
 * ----------------------------------------------------------------- */
let deleteTimer = null;
function handleListClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'recon') { openShift(btn.dataset.date); return; }
  const rec = LedgerStore.byId(btn.dataset.id);
  if (!rec) return;
  if (btn.dataset.action === 'edit') { fillDailyForm(rec); return; }

  if (btn.dataset.armed !== '1') {
    disarmAll();
    btn.dataset.armed = '1';
    btn.textContent = '确认删除';
    btn.classList.add('btn-danger-armed');
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(disarmAll, 4000);
    return;
  }
  clearTimeout(deleteTimer);
  if (state.editingId === rec.id) resetDailyForm();
  LedgerStore.remove(rec.id);
  renderAll();
  updateDateNote();
  showToast(`已删除 ${Utils.dateCn(rec.date)} 的营收记录（交班记录保留）`);
}
function disarmAll() {
  el.list.querySelectorAll('button[data-armed="1"]').forEach(b => {
    b.dataset.armed = ''; b.textContent = '删除'; b.classList.remove('btn-danger-armed');
  });
}

/* -----------------------------------------------------------------
 * 十一、导出 Excel：每日营收 + 交班明细 两张表
 * ----------------------------------------------------------------- */
function exportFileName(month) {
  const [y, m] = month.split('-');
  return `${CONFIG.HOTEL_NAME}营收台账_${y}年${m}月.xlsx`;
}

function buildWorkbook(month) {
  const list = LedgerStore.byMonth(month).slice().reverse();
  const s = Monthly.fromRecords(month, list);
  // 停用的渠道：这个月有金额才导出
  const used = c => c.active !== false || list.some(r => r[c.key]);
  const roomCols = ROOM_CHANNELS.filter(used);
  const nonCols = NON_ROOM_ITEMS.filter(used);

  const header = ['日期', '星期', '出租间数', '入住率', '平均房价', 'RevPAR',
    ...roomCols.map(c => c.label), '房费小计', ...nonCols.map(c => c.label), '非房费小计', '当日总营收',
    '前台应收', '交班收款', '对账差额', '备注'];
  const cols = header.length;
  const aoa = [
    [`${CONFIG.HOTEL_NAME}（${CONFIG.BRANCH_NAME}）营收台账 · ${Utils.monthCn(month)}`],
    [`总客房数：${CONFIG.TOTAL_ROOMS} 间　　导出时间：${Utils.today()} ${new Date().toTimeString().slice(0, 5)}`],
    header
  ];
  let sumCollected = 0, sumDesk = 0;
  list.forEach(r => {
    const rc = reconcile(r.date);
    const desk = RecordModel.deskReceivable(r);
    sumDesk += desk;
    sumCollected += rc.collected;
    aoa.push([r.date, Utils.weekday(r.date), r.roomSold, RecordModel.occupancy(r),
      r.roomSold > 0 ? r.adr : '', Utils.round2(RecordModel.revpar(r)),
      ...roomCols.map(c => r[c.key]), r.revenueRoom, ...nonCols.map(c => r[c.key]), r.revenueNonRoom, r.revenueTotal,
      desk, rc.shifts.length ? rc.collected : '', rc.shifts.length ? Utils.round2(rc.collected - desk) : '', r.remark]);
  });
  aoa.push(['本月合计', `${s.days} 天`, s.sold, s.occ, s.adr === null ? '' : Utils.round2(s.adr), s.revpar === null ? '' : Utils.round2(s.revpar),
    ...roomCols.map(c => s[c.key]), s.revenueRoom, ...nonCols.map(c => s[c.key]), s.revenueNonRoom, s.revenueTotal,
    Utils.round2(sumDesk), Utils.round2(sumCollected), Utils.round2(sumCollected - sumDesk), '入住率、平均房价按间夜加权']);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: cols - 1 } }];
  ws['!cols'] = header.map((h, i) => ({ wch: i === 0 ? 12 : (i === cols - 1 ? 30 : Math.max(9, h.length * 2 + 2)) }));
  formatSheetNumbers(ws, 3, aoa.length - 1, 3, cols - 2, [3]);

  // 第二张表：交班明细
  const shifts = ShiftStore.byMonth(month);
  const sh = [['日期', '班次', '交班人', ...PAYMENT_METHODS.map(p => p.label), '本班合计', '备注']];
  shifts.forEach(x => sh.push([x.date, shiftLabel(x.shift), x.staff, ...PAY_KEYS.map(k => x[k]), x.total, x.remark]));
  sh.push(['本月合计', `${shifts.length} 班`, '', ...PAY_KEYS.map(k => Utils.round2(shifts.reduce((t, x) => t + x[k], 0))),
    Utils.round2(shifts.reduce((t, x) => t + x.total, 0)), '']);
  const ws2 = XLSX.utils.aoa_to_sheet(sh);
  ws2['!cols'] = sh[0].map((h, i) => ({ wch: i === sh[0].length - 1 ? 30 : 12 }));
  formatSheetNumbers(ws2, 1, sh.length - 1, 3, 3 + PAY_KEYS.length, []);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '每日营收');
  XLSX.utils.book_append_sheet(wb, ws2, '交班明细');
  return wb;
}

async function handleExport() {
  const month = el.filterMonth.value || Utils.thisMonth();
  if (!LedgerStore.byMonth(month).length && !ShiftStore.byMonth(month).length) {
    showToast(`${Utils.monthCn(month)}没有记录，无需导出`, true);
    return;
  }
  if (typeof XLSX === 'undefined') { showToast('Excel 组件没有加载成功，请检查网络后刷新页面再试', true); return; }
  await saveWorkbook(buildWorkbook(month), exportFileName(month));
}

/* -----------------------------------------------------------------
 * 十二、初始化
 * ----------------------------------------------------------------- */
function init() {
  fillHeader();
  $('totalRoomsNote').textContent = CONFIG.TOTAL_ROOMS;
  el.roomSold.max = CONFIG.TOTAL_ROOMS;
  buildFields();
  LedgerStore.load();
  ShiftStore.load();

  const today = Utils.today();
  el.date.value = today;
  el.sDate.value = today;
  el.filterMonth.value = Utils.thisMonth();

  // 页签
  $('tabDaily').addEventListener('click', () => switchTab('daily'));
  $('tabShift').addEventListener('click', () => { switchTab('shift'); loadShift(); });

  // 每日营收
  el.form.addEventListener('submit', handleDailySubmit);
  [el.roomSold, ...Object.values(el.money)].forEach(i => i.addEventListener('input', updateLiveTotal));
  el.date.addEventListener('change', updateDateNote);
  el.date.addEventListener('input', updateDateNote);
  $('btnReset').addEventListener('click', resetDailyForm);
  $('btnCancelEdit').addEventListener('click', resetDailyForm);

  // 交班收款
  el.shiftForm.addEventListener('submit', handleShiftSubmit);
  Object.values(el.pay).forEach(i => i.addEventListener('input', updateShiftTotal));
  el.sDate.addEventListener('change', loadShift);
  $('shiftSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-shift]');
    if (!b) return;
    state.shift = b.dataset.shift;
    loadShift();
  });
  $('btnShiftDelete').addEventListener('click', handleShiftDelete);

  // 列表与筛选
  el.filterMonth.addEventListener('change', () => {
    if (!el.filterMonth.value) el.filterMonth.value = Utils.thisMonth();
    renderList();
  });
  $('btnThisMonth').addEventListener('click', () => { el.filterMonth.value = Utils.thisMonth(); renderList(); });
  el.list.addEventListener('click', handleListClick);
  $('btnExport').addEventListener('click', handleExport);

  // 月度对比
  $('metricSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-metric]');
    if (!b) return;
    state.metric = b.dataset.metric;
    renderMetricControls();
    renderChart();
  });
  $('yearSelect').addEventListener('change', e => { state.year = e.target.value; renderChart(); });
  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderChart, 150); });

  updateLiveTotal();
  updateDateNote();
  loadShift();
  renderAll();
}

init();
