const API_URL = "Your API endpoint URL";
const SITE_URL = "Your data source";

const FORCE_THEME = "auto";

const DARK = {
  shell: new Color("#0a0c10"),
  card: new Color("#161b22"),
  card2: new Color("#1c2230"),
  text: new Color("#e6edf3"),
  dim: new Color("#7d8590"),
  hairline: new Color("#272d36"),
  ringBg: new Color("#21262d"),
  barBg: new Color("#2a313c"),
  accent: new Color("#58a6ff"),
  green: new Color("#3fb950"),
  greenSoft: new Color("#13301c"),
  yellow: new Color("#d29922"),
  orange: new Color("#db6d28"),
};
const LIGHT = {
  shell: new Color("#ffffff"),
  card: new Color("#ffffff"),
  card2: new Color("#f6f8fb"),
  text: new Color("#1f2328"),
  dim: new Color("#8a9099"),
  hairline: new Color("#e4e8ee"),
  ringBg: new Color("#e6eaf0"),
  barBg: new Color("#e1e6ee"),
  accent: new Color("#0a69da"),
  green: new Color("#1a7f37"),
  greenSoft: new Color("#d8f3dd"),
  yellow: new Color("#9a6700"),
  orange: new Color("#bc4c00"),
};

const DARKMODE =
  FORCE_THEME === "auto"
    ? Device.isUsingDarkAppearance()
    : FORCE_THEME === "dark";
const SNAP = DARKMODE ? DARK : LIGHT;

function dyn(key) {
  return FORCE_THEME === "auto"
    ? Color.dynamic(LIGHT[key], DARK[key])
    : SNAP[key];
}
const C = {
  shell: dyn("shell"),
  card: dyn("card"),
  card2: dyn("card2"),
  text: dyn("text"),
  dim: dyn("dim"),
  hairline: dyn("hairline"),
  ringBg: dyn("ringBg"),
  barBg: dyn("barBg"),
  accent: dyn("accent"),
  green: dyn("green"),
  greenSoft: dyn("greenSoft"),
  yellow: dyn("yellow"),
  orange: dyn("orange"),
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}
function scoreColor(s) {
  if (s >= 80) return C.green;
  if (s >= 60) return C.accent;
  if (s >= 40) return C.yellow;
  return C.orange;
}
function scoreColorSnap(s) {
  if (s >= 80) return SNAP.green;
  if (s >= 60) return SNAP.accent;
  if (s >= 40) return SNAP.yellow;
  return SNAP.orange;
}
function scoreGrade(s) {
  if (s >= 80) return "Healthy";
  if (s >= 60) return "Good";
  if (s >= 40) return "Fair";
  return "Needs care";
}

function cardify(stack, opts) {
  opts = opts || {};
  stack.cornerRadius = opts.radius != null ? opts.radius : 16;
  stack.backgroundColor = opts.bg || C.card;
  stack.borderColor = C.hairline;
  stack.borderWidth = 1;
  const p = opts.pad != null ? opts.pad : 10;
  stack.setPadding(p, p + 1, p, p + 1);
}

function drawRing(score, size) {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const lw = size * 0.1;
  const inset = size * 0.14;
  const r = (size - lw) / 2 - inset;
  const cx = size / 2,
    cy = size / 2;
  const box = new Rect(
    lw / 2 + inset,
    lw / 2 + inset,
    size - lw - inset * 2,
    size - lw - inset * 2,
  );

  ctx.setStrokeColor(new Color("#888888", 0.28));
  ctx.setLineWidth(lw);
  const bgPath = new Path();
  bgPath.addEllipse(box);
  ctx.addPath(bgPath);
  ctx.strokePath();

  const col = scoreColorSnap(score);
  ctx.setStrokeColor(col);
  ctx.setLineWidth(lw);
  const start = -Math.PI / 2;
  const end = start + (Math.PI * 2 * score) / 100;
  const steps = 120;
  const arc = new Path();
  for (let i = 0; i <= steps; i++) {
    const t = start + (end - start) * (i / steps);
    const p = new Point(cx + r * Math.cos(t), cy + r * Math.sin(t));
    if (i === 0) arc.move(p);
    else arc.addLine(p);
  }
  ctx.addPath(arc);
  ctx.strokePath();
  return ctx.getImage();
}

async function loadData() {
  const req = new Request(API_URL);
  req.timeoutInterval = 15;
  const arr = await req.loadJSON();
  if (!Array.isArray(arr) || arr.length === 0) throw new Error("empty");
  return { allDays: arr, latest: arr[arr.length - 1] };
}

function computeHealthScore(allDays, latest) {
  const trend = latest.trend || [];
  const scores = [];

  const logEntries = (latest.dailyLog && latest.dailyLog.entries) || 0;
  const avgEntries =
    trend.length > 0
      ? trend.reduce((s, t) => s + (t.logEntries || 0), 0) / trend.length
      : logEntries;
  let logScore =
    avgEntries > 0
      ? clamp((logEntries / Math.max(avgEntries, 1)) * 80, 0, 100)
      : 0;
  if (latest.dailyLog && latest.dailyLog.exists && logEntries >= 10)
    logScore = Math.max(logScore, 60);
  scores.push({ value: logScore, weight: 0.2 });

  const totalNew = allDays.reduce(
    (s, d) =>
      s +
      ((d.graph && d.graph.newEntities) || 0) +
      ((d.graph && d.graph.newRelations) || 0),
    0,
  );
  let graphScore = totalNew > 0 ? clamp(50 + totalNew * 0.5, 50, 100) : 30;
  if (latest.graph && latest.graph.entities > 1000)
    graphScore = Math.max(graphScore, 60);
  scores.push({ value: graphScore, weight: 0.25 });

  let lanceScore = 0;
  if (latest.lancedb && latest.lancedb.exists) {
    lanceScore = 70;
    if (latest.lancedb.files > 1000) lanceScore = 85;
    if (latest.lancedb.files > 5000) lanceScore = 95;
  }
  scores.push({ value: lanceScore, weight: 0.2 });

  const now = Date.now() / 1000;
  const d = latest.distilled || {};
  const maxAge = Math.max(
    now - (d.topicsLastModified || 0),
    now - (d.projectsLastModified || 0),
  );
  let distillScore = 100;
  if (maxAge > 7 * 86400) distillScore = 70;
  if (maxAge > 30 * 86400) distillScore = 40;
  if (maxAge > 90 * 86400) distillScore = 20;
  if ((d.topicsCount || 0) + (d.projectsCount || 0) > 20)
    distillScore = Math.max(distillScore, 60);
  scores.push({ value: distillScore, weight: 0.2 });

  const diskPct = (latest.system && latest.system.diskUsagePercent) || 0;
  let diskScore = 100 - diskPct;
  if (diskPct > 90) diskScore = 10;
  else if (diskPct > 80) diskScore = 30;
  else if (diskPct > 60) diskScore = 60;
  scores.push({ value: diskScore, weight: 0.15 });

  return Math.round(scores.reduce((s, sc) => s + sc.value * sc.weight, 0));
}

function metricCard(parent, value, label, opts) {
  opts = opts || {};
  const c = parent.addStack();
  c.layoutVertically();
  cardify(c, {
    radius: 14,
    pad: opts.pad != null ? opts.pad : 9,
    bg: opts.bg || C.card,
  });
  if (opts.w || opts.h) c.size = new Size(opts.w || 0, opts.h || 0);
  c.addSpacer();
  const v = c.addText(value);
  v.textColor = opts.color || C.text;
  v.font = Font.boldSystemFont(opts.vf || 17);
  v.lineLimit = 1;
  c.addSpacer(1);
  const l = c.addText(label);
  l.textColor = C.dim;
  l.font = Font.mediumSystemFont(opts.lf || 9.5);
  l.lineLimit = 1;
  c.addSpacer();
  return c;
}

function createStripes() {
  const ctx = new DrawContext();
  const size = new Size(338, 158);
  ctx.size = size;
  ctx.opaque = false;
  const stripeColor = DARKMODE
    ? new Color("#888888", 0.05)
    : new Color("#888888", 0.08);
  ctx.setFillColor(stripeColor);
  const gap = 3;
  const lineWidth = DARKMODE ? 1 : 1;
  for (let x = 0; x < size.width; x += gap) {
    ctx.fillRect(new Rect(x, 0, lineWidth, size.height));
  }
  return ctx.getImage();
}

async function buildWidget() {
  const w = new ListWidget();
  w.backgroundColor = C.shell;
  w.backgroundImage = createStripes();
  w.setPadding(10, 11, 10, 11);

  let data;
  try {
    data = await loadData();
  } catch (e) {
    const t = w.addText("⚠︎ MemCare 数据获取失败");
    t.textColor = C.orange;
    t.font = Font.semiboldSystemFont(13);
    const sub = w.addText(String(e.message || e));
    sub.textColor = C.dim;
    sub.font = Font.systemFont(10);
    return w;
  }

  const { allDays, latest } = data;
  const score = computeHealthScore(allDays, latest);
  const g = latest.graph || {};
  const s = latest.search || {};
  const sys = latest.system || {};
  const dl = latest.dailyLog || {};
  const trend = latest.trend || [];
  const diskPct = sys.diskUsagePercent || 0;
  const hitRate = s.hitRate != null ? Math.round(s.hitRate * 100) + "%" : "—";

  w.addSpacer(0);
  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText("MemCare");
  title.textColor = C.text;
  title.font = Font.heavySystemFont(13);
  head.addSpacer();
  const badge = head.addStack();
  cardify(badge, { radius: 9, pad: 5, bg: score >= 60 ? C.greenSoft : C.card });
  badge.centerAlignContent();
  const dot = badge.addText("●");
  dot.textColor = scoreColor(score);
  dot.font = Font.systemFont(8);
  badge.addSpacer(4);
  const grade = badge.addText(scoreGrade(score));
  grade.textColor = score >= 60 ? C.green : C.dim;
  grade.font = Font.semiboldSystemFont(9.5);

  w.addSpacer(7);

  const RH = 108;
  const CH = (RH - 7) / 2;

  const body = w.addStack();
  body.layoutHorizontally();
  body.centerAlignContent();
  body.spacing = 7;

  const colL = body.addStack();
  colL.layoutVertically();
  colL.spacing = 7;
  metricCard(colL, fmt(g.entities || 0), "Entities", { w: 64, h: CH });
  metricCard(colL, fmt(g.relations || 0), "Relations", { w: 64, h: CH });

  const mid = body.addStack();
  mid.layoutVertically();
  mid.centerAlignContent();
  cardify(mid, { radius: 18, pad: 6 });
  mid.size = new Size(RH, RH);
  const ringImg = drawRing(score, 220);
  mid.backgroundImage = ringImg;
  mid.addSpacer();
  const scoreRow = mid.addStack();
  scoreRow.layoutHorizontally();
  scoreRow.addSpacer();
  const scoreTxt = scoreRow.addText(String(score));
  scoreTxt.textColor = scoreColor(score);
  scoreTxt.font = Font.heavySystemFont(30);
  scoreRow.addSpacer();
  mid.addSpacer();

  const colR = body.addStack();
  colR.layoutVertically();
  colR.spacing = 7;

  const rTop = colR.addStack();
  rTop.layoutHorizontally();
  rTop.spacing = 7;
  metricCard(rTop, hitRate, "Recall", {
    w: 70,
    h: CH,
    color: C.green,
    bg: C.greenSoft,
  });
  metricCard(rTop, diskPct + "%", "Disk", {
    w: 70,
    h: CH,
    color: diskPct > 80 ? C.orange : C.text,
  });

  const chartCard = colR.addStack();
  chartCard.layoutVertically();
  cardify(chartCard, { radius: 14, pad: 8 });
  chartCard.size = new Size(147, CH);
  const cHead = chartCard.addStack();
  cHead.layoutHorizontally();
  cHead.centerAlignContent();
  const cLabel = cHead.addText("7d");
  cLabel.textColor = C.dim;
  cLabel.font = Font.mediumSystemFont(8.5);
  cHead.addSpacer();
  const cDelta = cHead.addText("+" + (g.newEntities || 0));
  cDelta.textColor = C.accent;
  cDelta.font = Font.boldSystemFont(9);
  chartCard.addSpacer(4);
  if (trend.length > 1) {
    const ents = trend.map((t) => t.entities || 0);
    const min = Math.min(...ents),
      max = Math.max(...ents);
    const range = Math.max(max - min, 1);
    const n = ents.length;
    const maxBarH = 22,
      minBarH = 7;
    const bars = chartCard.addStack();
    bars.layoutHorizontally();
    bars.bottomAlignContent();
    bars.spacing = 3;
    for (let i = 0; i < n; i++) {
      const bh = minBarH + ((ents[i] - min) / range) * (maxBarH - minBarH);
      const col = bars.addStack();
      col.layoutVertically();
      col.addSpacer();
      const fill = col.addStack();
      fill.size = new Size(8, bh);
      fill.cornerRadius = 2;
      fill.backgroundColor = i === n - 1 ? C.accent : C.barBg;
    }
    bars.addSpacer();
  }

  w.addSpacer(3);

  return w;
}

const widget = await buildWidget();
widget.refreshAfterDate = new Date(Date.now() + 8 * 60 * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
