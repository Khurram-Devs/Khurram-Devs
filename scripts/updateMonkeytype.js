import fs from "fs";
import path from "path";

const API_BASE = "https://api.monkeytype.com";
const OWNER = "Khurram-Devs";
const REPO = "Khurram-Devs";
const ASSET_PATH = "assets/monkeytype-card.svg";

const apiKey = process.env.MONKEYTYPE_API_KEY;
if (!apiKey) {
  console.error("Missing MONKEYTYPE_API_KEY env var.");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJSON(url, { retries = 3, timeoutMs = 10000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `ApeKey ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after")) || attempt * 2;
        await sleep(retryAfter * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);

      const json = await res.json();
      return json.data;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await sleep(attempt * 1000);
    }
  }
  throw lastErr;
}

async function getPersonalBest(seconds) {
  try {
    const data = await fetchJSON(`${API_BASE}/users/personalBests?mode=time&mode2=${seconds}`);
    if (!Array.isArray(data) || !data.length) return null;
    return data.reduce((best, cur) => (cur.wpm > best.wpm ? cur : best));
  } catch (err) {
    console.warn(`PB fetch failed for ${seconds}s:`, err.message);
    return null;
  }
}

function computeStreak(results) {
  if (!Array.isArray(results) || !results.length) return 0;
  const days = new Set(results.map((r) => new Date(r.timestamp).toISOString().slice(0, 10)));
  const cursor = new Date();
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

const TIERS = [
  { name: "Rookie", min: 0, color: "#8b8f98" },
  { name: "Bronze", min: 30, color: "#cd7f32" },
  { name: "Silver", min: 50, color: "#c0c0c0" },
  { name: "Gold", min: 70, color: "#ffd700" },
  { name: "Platinum", min: 90, color: "#4fd1c5" },
  { name: "Diamond", min: 110, color: "#7dd3fc" },
  { name: "Grandmaster", min: 130, color: "#f472b6" },
];

function getTier(wpm) {
  let tier = TIERS[0];
  let next = TIERS[1] ?? null;
  for (let i = 0; i < TIERS.length; i++) {
    if (wpm >= TIERS[i].min) {
      tier = TIERS[i];
      next = TIERS[i + 1] ?? null;
    }
  }
  const progress = next ? Math.min(100, ((wpm - tier.min) / (next.min - tier.min)) * 100) : 100;
  return { tier, next, progress };
}

function getLevel(completedTests) {
  const level = Math.floor(Math.sqrt(completedTests / 5)) + 1;
  const currentFloor = 5 * (level - 1) ** 2;
  const nextFloor = 5 * level ** 2;
  const progress = Math.min(100, ((completedTests - currentFloor) / (nextFloor - currentFloor)) * 100);
  return { level, progress };
}

function getAchievements({ bestWpm, bestAcc, streak, completedTests }) {
  return [
    { icon: "⚡", label: "Speed Demon", unlocked: bestWpm >= 80 },
    { icon: "🎯", label: "Sharpshooter", unlocked: bestAcc >= 98 },
    { icon: "🔥", label: "On Fire", unlocked: streak >= 7 },
    { icon: "🏃", label: "Marathoner", unlocked: completedTests >= 1000 },
    { icon: "💎", label: "Diamond Tier", unlocked: bestWpm >= 110 },
  ];
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statCard({ x, y, w, h, duration, pb, tierColor, maxScale, delay }) {
  const barW = w - 36;
  const ringR = 22;
  const ringCx = x + w - 40;
  const ringCy = y + 38;
  const circumference = 2 * Math.PI * ringR;

  if (!pb) {
    return `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#161b22" stroke="#30363d"/>
      <text x="${x + 18}" y="${y + 26}" font-size="11" font-weight="600" letter-spacing="1" fill="#8b949e">${duration}s SPRINT</text>
      <text x="${x + w / 2}" y="${y + h / 2 + 8}" text-anchor="middle" font-size="16" fill="#484f58">No data yet</text>
    `;
  }

  const wpm = pb.wpm;
  const acc = pb.acc ?? 0;
  const consistency = pb.consistency ?? null;
  const fillW = Math.max(0, Math.min(barW, (wpm / maxScale) * barW));
  const dashOffset = circumference * (1 - acc / 100);

  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#161b22" stroke="#30363d"/>
    <text x="${x + 18}" y="${y + 26}" font-size="11" font-weight="600" letter-spacing="1" fill="#8b949e">${duration}s SPRINT</text>

    <g transform="rotate(-90 ${ringCx} ${ringCy})">
      <circle cx="${ringCx}" cy="${ringCy}" r="${ringR}" stroke="#21262d" stroke-width="5" fill="none"/>
      <circle cx="${ringCx}" cy="${ringCy}" r="${ringR}" stroke="${tierColor}" stroke-width="5" fill="none"
        stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}">
        <animate attributeName="stroke-dashoffset" from="${circumference}" to="${dashOffset}"
          dur="0.9s" begin="${delay}s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1"/>
      </circle>
    </g>
    <text x="${ringCx}" y="${ringCy + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${acc.toFixed(0)}%</text>

    <text x="${x + 18}" y="${y + 78}" font-size="36" font-weight="800" fill="${tierColor}">${wpm.toFixed(2)}</text>
    <text x="${x + 18}" y="${y + 96}" font-size="11" letter-spacing="1" fill="#8b949e">WPM</text>

    <rect x="${x + 18}" y="${y + 112}" width="${barW}" height="8" rx="4" fill="#21262d"/>
    <rect x="${x + 18}" y="${y + 112}" width="0" height="8" rx="4" fill="${tierColor}">
      <animate attributeName="width" from="0" to="${fillW}" dur="0.9s" begin="${delay}s"
        fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1"/>
    </rect>
    <text x="${x + 18}" y="${y + 136}" font-size="10" fill="#8b949e">${
      consistency !== null ? `Consistency ${consistency.toFixed(0)}%` : "Consistency —"
    }</text>
  `;
}

function buildSVG(data) {
  const { pb15, pb30, pb60, tier, next, tierProgress, level, levelProgress, streak, completedTests, timeTypingHours, achievements, updatedAt } = data;

  const W = 920;
  const H = 400;
  const margin = 30;
  const contentW = W - margin * 2;
  const tierColor = tier.color;

  const wpms = [pb15?.wpm, pb30?.wpm, pb60?.wpm].filter((v) => typeof v === "number");
  const maxScale = Math.max(150, Math.ceil((wpms.length ? Math.max(...wpms) : 0) / 10) * 10);

  const cardGap = 20;
  const cardW = (contentW - 2 * cardGap) / 3;
  const cardY = 112;
  const cardH = 150;
  const cardX = [margin, margin + cardW + cardGap, margin + 2 * (cardW + cardGap)];

  const cards = [
    statCard({ x: cardX[0], y: cardY, w: cardW, h: cardH, duration: 15, pb: pb15, tierColor, maxScale, delay: 0.1 }),
    statCard({ x: cardX[1], y: cardY, w: cardW, h: cardH, duration: 30, pb: pb30, tierColor, maxScale, delay: 0.25 }),
    statCard({ x: cardX[2], y: cardY, w: cardW, h: cardH, duration: 60, pb: pb60, tierColor, maxScale, delay: 0.4 }),
  ].join("\n");

  const badgeGap = 10;
  const badgeW = (contentW - 4 * badgeGap) / 5;
  const achievementBadges = achievements
    .map((a, i) => {
      const x = margin + i * (badgeW + badgeGap);
      const y = 300;
      const fill = a.unlocked ? `${tierColor}22` : "#21262d";
      const stroke = a.unlocked ? tierColor : "#30363d";
      const textColor = a.unlocked ? "#fff" : "#484f58";
      return `
        <rect x="${x}" y="${y}" width="${badgeW}" height="32" rx="16" fill="${fill}" stroke="${stroke}"/>
        <text x="${x + 14}" y="${y + 21}" font-size="14">${a.icon}</text>
        <text x="${x + 34}" y="${y + 21}" font-size="10" font-weight="600" fill="${textColor}">${esc(a.label)}</text>
      `;
    })
    .join("\n");

  const levelBarW = contentW - 80;
  const xpFillW = Math.max(0, Math.min(levelBarW, (levelProgress / 100) * levelBarW));

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">
  <title>Monkeytype Stats</title>
  <desc>15s PB ${pb15?.wpm?.toFixed(2) ?? "N/A"} WPM, 30s PB ${pb30?.wpm?.toFixed(2) ?? "N/A"} WPM, 60s PB ${
    pb60?.wpm?.toFixed(2) ?? "N/A"
  } WPM, ${tier.name} tier, ${streak}-day streak.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
    <linearGradient id="xpFill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${tierColor}"/>
      <stop offset="100%" stop-color="${tierColor}cc"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="url(#bg)" stroke="${tierColor}" stroke-opacity="0.35"/>

  <text x="${margin}" y="46" font-size="22" font-weight="800" fill="#e6edf3">⌨ MONKEYTYPE STATS</text>

  <g filter="url(#glow)">
    <rect x="${W - margin - 170}" y="24" width="170" height="32" rx="16" fill="${tierColor}22" stroke="${tierColor}"/>
    <text x="${W - margin - 85}" y="45" text-anchor="middle" font-size="13" font-weight="700" fill="${tierColor}">${esc(
    tier.name
  ).toUpperCase()} TIER</text>
  </g>

  <text x="${margin}" y="82" font-size="12" font-weight="700" fill="#e6edf3">LVL ${level}</text>
  <rect x="110" y="76" width="${levelBarW}" height="10" rx="5" fill="#21262d"/>
  <rect x="110" y="76" width="0" height="10" rx="5" fill="url(#xpFill)">
    <animate attributeName="width" from="0" to="${xpFillW}" dur="1s" begin="0s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1"/>
  </rect>
  <text x="${W - margin}" y="90" text-anchor="end" font-size="11" fill="#8b949e">${completedTests} tests played${
    next ? ` • ${tierProgress.toFixed(0)}% to ${esc(next.name)}` : " • Max tier"
  }</text>

  ${cards}

  <text x="${margin}" y="292" font-size="11" font-weight="600" letter-spacing="1" fill="#8b949e">ACHIEVEMENTS</text>
  ${achievementBadges}

  <text x="${margin}" y="372" font-size="13" font-weight="700" fill="#f97316">🔥 ${streak}-day streak</text>
  <text x="${margin + 200}" y="372" font-size="12" fill="#8b949e">⏱ ${timeTypingHours}h typed</text>
  <text x="${W - margin}" y="368" text-anchor="end" font-size="10" fill="#484f58">Updated ${esc(updatedAt)}</text>
</svg>`;
}

function updateReadme(svgUrl, altText) {
  const readmePath = "README.md";
  const readme = fs.readFileSync(readmePath, "utf8");
  const marker = /<!-- MONKEYTYPE_STATS_START -->[\s\S]*?<!-- MONKEYTYPE_STATS_END -->/;

  if (!marker.test(readme)) {
    throw new Error("MONKEYTYPE_STATS markers not found in README.md");
  }

  const block = `<!-- MONKEYTYPE_STATS_START -->
<div align="center">
  <img src="${svgUrl}" alt="${esc(altText)}" width="900"/>
</div>
<!-- MONKEYTYPE_STATS_END -->`;

  fs.writeFileSync(readmePath, readme.replace(marker, block));
}

async function main() {
  const [pb15, pb30, pb60, results, userStats] = await Promise.all([
    getPersonalBest(15),
    getPersonalBest(30),
    getPersonalBest(60),
    fetchJSON(`${API_BASE}/results`).catch(() => []),
    fetchJSON(`${API_BASE}/users/stats`).catch(() => ({})),
  ]);

  const bestWpm = Math.max(pb15?.wpm ?? 0, pb30?.wpm ?? 0, pb60?.wpm ?? 0);
  const bestAcc = Math.max(pb15?.acc ?? 0, pb30?.acc ?? 0, pb60?.acc ?? 0);
  const streak = computeStreak(results);
  const completedTests = userStats?.completedTests ?? 0;
  const timeTypingHours = ((userStats?.timeTyping ?? 0) / 3600).toFixed(1);

  const { tier, next, progress: tierProgress } = getTier(bestWpm);
  const { level, progress: levelProgress } = getLevel(completedTests);
  const achievements = getAchievements({ bestWpm, bestAcc, streak, completedTests });
  const updatedAt = new Date().toUTCString();

  const svg = buildSVG({
    pb15,
    pb30,
    pb60,
    tier,
    next,
    tierProgress,
    level,
    levelProgress,
    streak,
    completedTests,
    timeTypingHours,
    achievements,
    updatedAt,
  });

  fs.mkdirSync(path.dirname(ASSET_PATH), { recursive: true });
  fs.writeFileSync(ASSET_PATH, svg);

  const svgUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${ASSET_PATH}?v=${Date.now()}`;
  const altText = `${tier.name} tier — 60s PB ${pb60?.wpm?.toFixed(2) ?? "N/A"} WPM, ${streak}-day streak`;
  updateReadme(svgUrl, altText);

  console.log(`Updated. Tier=${tier.name} 60s=${pb60?.wpm ?? "N/A"} streak=${streak}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
