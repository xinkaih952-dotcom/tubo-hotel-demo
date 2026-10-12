/* =================================================================
 * 演示数据生成器（全部虚构，不是酒店真实数据）
 * 按打开网页的日期自动生成：
 *   - HISTORY：截至两个月前的 20 个月月度营收（替代真实版的 data.js）
 *   - HISTORY_COSTS：截至上个月的 21 个月月度成本（替代真实版的 finance-data.js）
 *   - DemoGen.dailyRecords / dailyShifts：上个月和本月的每日记录、交班记录（由 demo.js 写入浏览器）
 * 同一个月份每次生成的数字都一样（固定随机种子），刷新页面不会变
 * ================================================================= */

const DemoGen = (() => {
  /* 固定种子的随机数：同一个字符串永远得到同一串数 */
  function rng(seedText) {
    let h = 2166136261;
    for (let i = 0; i < seedText.length; i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => {
      h += 0x6D2B79F5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const r2 = n => Math.round(n * 100) / 100;
  const between = (rand, a, b) => a + (b - a) * rand();
  const pad = n => String(n).padStart(2, '0');
  const daysIn = (y, m) => new Date(y, m, 0).getDate();
  const ROOMS = 68;

  /* 季节规律（1–12 月）：入住率、平均房价、电费系数 */
  const OCC = [0.70, 0.84, 0.64, 0.74, 0.70, 0.66, 0.88, 0.90, 0.66, 0.76, 0.58, 0.60];
  const ADR = [150, 208, 146, 158, 154, 138, 170, 176, 148, 168, 126, 128];
  const POWER = [0.75, 0.70, 0.75, 0.85, 1.0, 1.25, 1.45, 1.45, 1.2, 0.95, 0.8, 0.8];

  /** 把房费按渠道拆分 */
  function splitRoom(total, rand) {
    const w = {
      revCtrip: between(rand, 0.46, 0.56), revMeituan: between(rand, 0.28, 0.36), revFliggy: between(rand, 0.03, 0.08),
      revDouyin: between(rand, 0.005, 0.03), revPos: between(rand, 0.03, 0.07), revCash: between(rand, 0.003, 0.012)
    };
    const s = Object.values(w).reduce((a, b) => a + b, 0);
    const out = { revHuatuo: 0 };
    let acc = 0;
    const keys = Object.keys(w);
    keys.forEach((k, i) => {
      out[k] = i === keys.length - 1 ? r2(total - acc) : r2(total * w[k] / s);
      acc += out[k];
    });
    return out;
  }

  /** 某月月度营收 */
  function monthRevenue(y, m) {
    const rand = rng(`rev-${y}-${m}`);
    const days = daysIn(y, m);
    const avail = ROOMS * days;
    const occ = Math.min(0.95, Math.max(0.5, OCC[m - 1] + between(rand, -0.04, 0.04)));
    const sold = Math.round(avail * occ);
    const adr = r2(ADR[m - 1] + between(rand, -8, 8));
    const roomRev = r2(sold * adr * between(rand, 1.025, 1.05));
    return Object.assign({ month: `${y}-${pad(m)}`, avail, sold, adr }, splitRoom(roomRev, rand), {
      revStore: r2(days * between(rand, 2800, 3800)),
      revGoods: r2(days * between(rand, 15, 60)),
      revBreakfast: r2(days * between(rand, 15, 40)),
      revKiosk: 0,
      revOther: rand() < 0.1 ? r2(between(rand, 500, 3000)) : 0
    });
  }

  /** 某月月度成本（结构与利润表一致） */
  function monthCost(y, m, rev) {
    const rand = rng(`cost-${y}-${m}`);
    const sold = rev ? rev.sold : 1500;
    const store = rev ? rev.revStore : 100000;
    const goods = rev ? rev.revGoods : 1000;
    const c = {
      month: `${y}-${pad(m)}`,
      costSupplies: r2(sold * between(rand, 1.5, 1.9)),
      costLaundry: r2(sold * between(rand, 6.0, 7.5)),
      costRestaurant: r2(between(rand, 2800, 4600)),
      costWater: r2(between(rand, 650, 1150)),
      costPower: r2(14000 * POWER[m - 1] * between(rand, 0.92, 1.08)),
      costPowerExhibit: r2(between(rand, 1100, 1900)),
      costPowerSign: r2(between(rand, 1, 45)),
      costRentShop: 95000, costPropertyShop: 2400, costRentExhibit: 5000, costPropertyExhibit: 390, costRentToll: 750,
      costWageMgmt: r2(15500 + between(rand, -500, 500)),
      costWageFront: r2(14500 + between(rand, -800, 800)),
      costWageRoom: r2(12500 + between(rand, -1200, 1200)),
      costWageSecurity: r2(5700 + between(rand, -300, 300)),
      costWageKitchen: 2800,
      costOffice: r2(between(rand, 1200, 4200)),
      costGarbage: 900,
      costWelfare: r2(between(rand, 2200, 2700)),
      costMedical: r2(between(rand, 280, 2100)),
      costSocial: r2(between(rand, 680, 2100)),
      costNetwork: rand() < 0.6 ? 3500 : 0,
      costRepair: rand() < 0.5 ? r2(between(rand, 300, 2600)) : 0,
      costPest: m === 8 ? 4200 : 0,
      costAir: m === 8 ? 3200 : 0,
      costBankFee: r2(between(rand, 60, 650)),
      costTax: [1, 4, 7, 10].includes(m) ? r2(between(rand, 2500, 5200)) : 0,
      costStoreCogs: r2(store * between(rand, 0.48, 0.55)),
      costGoodsCogs: r2(goods * 0.3),
      costStoreCommission: r2(between(rand, 2500, 4000)),
      costPreopening: 55000
    };
    return c;
  }

  /** 从今天往前数第 n 个月 */
  function monthsBack(n) {
    const d = new Date();
    const t = new Date(d.getFullYear(), d.getMonth() - n, 1);
    return [t.getFullYear(), t.getMonth() + 1];
  }

  /** 某一天的营收记录 */
  function dayRecord(dateStr) {
    const rand = rng(`day-${dateStr}`);
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    const weekend = dow === 5 || dow === 6;
    const occ = Math.min(1, Math.max(0.4, OCC[m - 1] + (weekend ? 0.08 : -0.03) + between(rand, -0.08, 0.08)));
    const sold = Math.round(ROOMS * occ);
    const adr = r2(ADR[m - 1] + (weekend ? 10 : 0) + between(rand, -10, 10));
    const roomRev = r2(sold * adr * between(rand, 1.02, 1.05));
    return Object.assign({ date: dateStr, roomSold: sold, adr }, splitRoom(roomRev, rand), {
      revStore: r2(between(rand, 2600, 4200)),
      revGoods: rand() < 0.6 ? r2(between(rand, 10, 80)) : 0,
      revBreakfast: rand() < 0.7 ? r2(between(rand, 10, 60)) : 0,
      revKiosk: 0, revOther: 0,
      remark: rand() < 0.12 ? ['团队入住 8 间', '602 空调维修停售', '会议客户 5 间连住', '暴雨，散客取消较多'][Math.floor(rand() * 4)] : ''
    });
  }

  return {
    /** 截至两个月前的 20 个月月度营收 */
    revenueHistory() {
      const out = [];
      for (let n = 21; n >= 2; n--) { const [y, m] = monthsBack(n); out.push(monthRevenue(y, m)); }
      return out;
    },
    /** 截至上个月的 21 个月月度成本 */
    costHistory() {
      const out = [];
      for (let n = 21; n >= 1; n--) { const [y, m] = monthsBack(n); out.push(monthCost(y, m, n >= 2 ? monthRevenue(y, m) : null)); }
      return out;
    },
    /** 上个月整月 + 本月 1 号到昨天的每日记录 */
    dailyRecords() {
      const out = [];
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      for (let t = new Date(start); t < new Date(today.getFullYear(), today.getMonth(), today.getDate()); t.setDate(t.getDate() + 1)) {
        out.push(dayRecord(`${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`));
      }
      return out;
    },
    /** 按每日记录生成交班收款：大部分已平，个别有差额，最近一天缺晚班 */
    dailyShifts(records, deskKeys) {
      const out = [];
      records.forEach((r, idx) => {
        const rand = rng(`shift-${r.date}`);
        const desk = r2(deskKeys.reduce((s, k) => s + (r[k] || 0), 0));
        const isLast = idx === records.length - 1;
        const early = r2(desk * between(rand, 0.38, 0.5));
        let late = r2(desk - early);
        if (idx === records.length - 4) late = r2(late - 50);            // 演示一笔差额
        const split = (total, seed) => {
          const rr = rng(seed);
          const cash = r2(total * between(rr, 0.04, 0.1));
          const credit = rr() < 0.15 ? r2(total * 0.08) : 0;
          const alipay = r2((total - cash - credit) * between(rr, 0.2, 0.35));
          return { payWechat: r2(total - cash - credit - alipay), payAlipay: alipay, payCash: cash, payCredit: credit };
        };
        out.push(Object.assign({ date: r.date, shift: 'early', staff: ['小李', '小陈'][idx % 2], remark: '' }, split(early, `e-${r.date}`)));
        if (!isLast) out.push(Object.assign({ date: r.date, shift: 'late', staff: ['小王', '小周'][idx % 2], remark: '' }, split(late, `l-${r.date}`)));
      });
      return out;
    }
  };
})();

const HISTORY = DemoGen.revenueHistory();
const HISTORY_COSTS = DemoGen.costHistory();
