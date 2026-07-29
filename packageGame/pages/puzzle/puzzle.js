// 乾坤挪移：滑块复原图案（华容道 × 拼图结合）
// 点击与空位同行/同列的方块即可整段推动；不同图案 + 递进网格构成关卡；
// 洗牌只做随机合法移动，必然有解；图案由 Canvas 程序化生成，零图片资源。

const BEST_KEY = 'puzzleBest';        // { levelId: 最少步数 }
const UNLOCK_KEY = 'puzzleUnlocked';  // 已解锁关卡数（1 起）
const SFX_GAIN = 1.4;

// ==================== 工具函数 ====================
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => Date.now();
// 确定性随机（图案里的星星/花瓣散布用，保证每次进关图案一致）
function seededRng(seed) {
  let h = seed >>> 0;
  return function () {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

// ==================== 关卡图案（ctx 已按逻辑尺寸缩放，s 为画布边长） ====================
function drawMelon(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, '#bbf7d0'); g.addColorStop(1, '#86efac');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  // 瓜皮 → 白瓤 → 红瓤
  ctx.fillStyle = '#15803d'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.47, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0fdf4'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.38, 0, Math.PI * 2); ctx.fill();
  // 深色条纹瓜皮
  ctx.strokeStyle = '#166534'; ctx.lineWidth = s * 0.02;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.445, a, a + 0.28);
    ctx.stroke();
  }
  // 瓜子两圈
  ctx.fillStyle = '#1c1917';
  for (let ring = 0; ring < 2; ring++) {
    const rr = s * (0.14 + ring * 0.13), cnt = 6 + ring * 4;
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * Math.PI * 2 + ring * 0.4;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.014, s * 0.026, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}

function drawSunflower(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#7dd3fc'); g.addColorStop(1, '#e0f2fe');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // 白云
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  [[0.2, 0.16], [0.78, 0.12]].forEach(([fx, fy]) => {
    ctx.beginPath();
    ctx.arc(s * fx, s * fy, s * 0.07, 0, Math.PI * 2);
    ctx.arc(s * (fx + 0.07), s * (fy + 0.02), s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  });
  const cx = s / 2, cy = s * 0.56;
  // 花瓣两层
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer === 0 ? '#f59e0b' : '#fbbf24';
    const cnt = 14, off = layer * (Math.PI / 14);
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * Math.PI * 2 + off;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * s * 0.24, cy + Math.sin(a) * s * 0.24);
      ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.13, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  // 花盘 + 籽
  ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#451a03';
  const rng = seededRng(77);
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * s * 0.15;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, s * 0.008, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPanda(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, '#d1fae5'); g.addColorStop(1, '#a7f3d0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // 角落竹叶
  ctx.font = s * 0.12 + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🎋', s * 0.1, s * 0.12);
  ctx.fillText('🎋', s * 0.9, s * 0.88);
  const cx = s / 2, cy = s * 0.52;
  // 耳朵
  ctx.fillStyle = '#1c1917';
  ctx.beginPath(); ctx.arc(cx - s * 0.26, cy - s * 0.26, s * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + s * 0.26, cy - s * 0.26, s * 0.11, 0, Math.PI * 2); ctx.fill();
  // 脸
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = s * 0.008; ctx.stroke();
  // 眼圈（斜椭圆）+ 眼睛
  ctx.fillStyle = '#1c1917';
  [-1, 1].forEach(d => {
    ctx.save();
    ctx.translate(cx + d * s * 0.13, cy - s * 0.04);
    ctx.rotate(d * 0.5);
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.07, s * 0.095, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
  ctx.fillStyle = '#ffffff';
  [-1, 1].forEach(d => {
    ctx.beginPath(); ctx.arc(cx + d * s * 0.12, cy - s * 0.05, s * 0.022, 0, Math.PI * 2); ctx.fill();
  });
  // 鼻子 + 嘴
  ctx.fillStyle = '#1c1917';
  ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.08, s * 0.035, s * 0.025, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1c1917'; ctx.lineWidth = s * 0.012;
  ctx.beginPath(); ctx.arc(cx, cy + s * 0.1, s * 0.05, 0.3, Math.PI - 0.3); ctx.stroke();
}

function drawRainbow(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#60a5fa'); g.addColorStop(1, '#dbeafe');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // 太阳
  ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(s * 0.84, s * 0.16, s * 0.09, 0, Math.PI * 2); ctx.fill();
  // 彩虹拱（自外向内）
  const colors = ['#ef4444', '#f97316', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'];
  const cy = s * 0.95;
  colors.forEach((c, i) => {
    ctx.strokeStyle = c; ctx.lineWidth = s * 0.045;
    ctx.beginPath(); ctx.arc(s / 2, cy, s * (0.62 - i * 0.05), Math.PI, Math.PI * 2); ctx.stroke();
  });
  // 拱脚白云
  ctx.fillStyle = '#ffffff';
  [[0.12, 0.9], [0.88, 0.9]].forEach(([fx, fy]) => {
    ctx.beginPath();
    ctx.arc(s * fx, s * fy, s * 0.09, 0, Math.PI * 2);
    ctx.arc(s * (fx - 0.07), s * (fy + 0.03), s * 0.065, 0, Math.PI * 2);
    ctx.arc(s * (fx + 0.07), s * (fy + 0.03), s * 0.065, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawRocket(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, '#0f172a'); g.addColorStop(1, '#312e81');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // 星星
  const rng = seededRng(42);
  for (let i = 0; i < 36; i++) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + rng() * 0.6) + ')';
    ctx.beginPath(); ctx.arc(rng() * s, rng() * s, s * (0.004 + rng() * 0.006), 0, Math.PI * 2); ctx.fill();
  }
  // 角落星球
  ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.arc(s * 0.85, s * 0.2, s * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fbcfe8'; ctx.lineWidth = s * 0.014;
  ctx.beginPath(); ctx.ellipse(s * 0.85, s * 0.2, s * 0.13, s * 0.035, -0.4, 0, Math.PI * 2); ctx.stroke();
  // 火箭（居中斜置改为竖直，便于拼认）
  const cx = s * 0.46, w = s * 0.16;
  // 尾焰
  ctx.fillStyle = '#f97316';
  ctx.beginPath(); ctx.moveTo(cx - w * 0.4, s * 0.72); ctx.lineTo(cx, s * 0.88); ctx.lineTo(cx + w * 0.4, s * 0.72); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fde047';
  ctx.beginPath(); ctx.moveTo(cx - w * 0.2, s * 0.72); ctx.lineTo(cx, s * 0.81); ctx.lineTo(cx + w * 0.2, s * 0.72); ctx.closePath(); ctx.fill();
  // 尾翼
  ctx.fillStyle = '#dc2626';
  ctx.beginPath(); ctx.moveTo(cx - w / 2, s * 0.58); ctx.lineTo(cx - w, s * 0.74); ctx.lineTo(cx - w / 2, s * 0.72); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + w / 2, s * 0.58); ctx.lineTo(cx + w, s * 0.74); ctx.lineTo(cx + w / 2, s * 0.72); ctx.closePath(); ctx.fill();
  // 箭身 + 头锥 + 舷窗
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, s * 0.36); ctx.lineTo(cx + w / 2, s * 0.36);
  ctx.lineTo(cx + w / 2, s * 0.72); ctx.lineTo(cx - w / 2, s * 0.72);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.moveTo(cx - w / 2, s * 0.36); ctx.quadraticCurveTo(cx, s * 0.16, cx + w / 2, s * 0.36); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath(); ctx.arc(cx, s * 0.47, w * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = s * 0.012; ctx.stroke();
}

function drawSakura(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#1e1b4b'); g.addColorStop(0.6, '#6d28d9'); g.addColorStop(1, '#be185d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // 圆月
  ctx.fillStyle = '#fef9c3'; ctx.beginPath(); ctx.arc(s * 0.72, s * 0.22, s * 0.13, 0, Math.PI * 2); ctx.fill();
  // 远山剪影
  ctx.fillStyle = 'rgba(15,23,42,.6)';
  ctx.beginPath();
  ctx.moveTo(0, s); ctx.lineTo(0, s * 0.78);
  ctx.quadraticCurveTo(s * 0.3, s * 0.6, s * 0.55, s * 0.82);
  ctx.quadraticCurveTo(s * 0.8, s * 0.68, s, s * 0.8);
  ctx.lineTo(s, s); ctx.closePath(); ctx.fill();
  // 樱花枝（左上）
  ctx.strokeStyle = '#44403c'; ctx.lineWidth = s * 0.02; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, s * 0.08); ctx.quadraticCurveTo(s * 0.22, s * 0.18, s * 0.4, s * 0.14); ctx.stroke();
  // 樱花散布
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const rng = seededRng(2026);
  for (let i = 0; i < 14; i++) {
    const fs = s * (0.05 + rng() * 0.06);
    ctx.font = fs + 'px serif';
    ctx.fillText('🌸', rng() * s, rng() * s * 0.7);
  }
}

// 圆角矩形路径（图案绘制通用）
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCat(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#fef3c7'); g.addColorStop(1, '#fdba74');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // 角落小鱼干 + 毛线球
  ctx.font = s * 0.1 + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🐟', s * 0.12, s * 0.1);
  ctx.fillText('🧶', s * 0.88, s * 0.92);
  const cx = s / 2, cy = s * 0.54, R = s * 0.3;
  // 耳朵（外橙内粉）
  [-1, 1].forEach(d => {
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.moveTo(cx + d * R * 0.9, cy - R * 0.5);
    ctx.lineTo(cx + d * R * 1.15, cy - R * 1.35);
    ctx.lineTo(cx + d * R * 0.3, cy - R * 0.92);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fda4af';
    ctx.beginPath();
    ctx.moveTo(cx + d * R * 0.85, cy - R * 0.62);
    ctx.lineTo(cx + d * R * 1.02, cy - R * 1.18);
    ctx.lineTo(cx + d * R * 0.45, cy - R * 0.88);
    ctx.closePath(); ctx.fill();
  });
  // 脸 + 额头条纹
  ctx.fillStyle = '#fb923c';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ea580c'; ctx.lineWidth = s * 0.022; ctx.lineCap = 'round';
  [-1, 0, 1].forEach(d => {
    ctx.beginPath();
    ctx.moveTo(cx + d * R * 0.28, cy - R * 0.95);
    ctx.lineTo(cx + d * R * 0.34, cy - R * 0.62);
    ctx.stroke();
  });
  // 眼睛 + 高光
  ctx.fillStyle = '#1c1917';
  [-1, 1].forEach(d => { ctx.beginPath(); ctx.arc(cx + d * R * 0.42, cy - R * 0.1, R * 0.13, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#fff';
  [-1, 1].forEach(d => { ctx.beginPath(); ctx.arc(cx + d * R * 0.38, cy - R * 0.16, R * 0.045, 0, Math.PI * 2); ctx.fill(); });
  // 腮红
  ctx.fillStyle = 'rgba(251,113,133,.55)';
  [-1, 1].forEach(d => { ctx.beginPath(); ctx.arc(cx + d * R * 0.68, cy + R * 0.22, R * 0.14, 0, Math.PI * 2); ctx.fill(); });
  // 鼻子 + w 嘴
  ctx.fillStyle = '#f472b6';
  ctx.beginPath();
  ctx.moveTo(cx - R * 0.09, cy + R * 0.14);
  ctx.lineTo(cx + R * 0.09, cy + R * 0.14);
  ctx.lineTo(cx, cy + R * 0.26);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#9a3412'; ctx.lineWidth = s * 0.014;
  ctx.beginPath(); ctx.arc(cx - R * 0.14, cy + R * 0.3, R * 0.14, 0.15, Math.PI - 0.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + R * 0.14, cy + R * 0.3, R * 0.14, 0.5, Math.PI - 0.15); ctx.stroke();
  // 胡须
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = s * 0.011;
  [-1, 1].forEach(d => [ -0.06, 0.08, 0.22 ].forEach(dy => {
    ctx.beginPath();
    ctx.moveTo(cx + d * R * 0.72, cy + R * (dy + 0.06));
    ctx.lineTo(cx + d * R * 1.5, cy + R * dy);
    ctx.stroke();
  }));
}

function drawRobot(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, '#164e63'); g.addColorStop(1, '#0ea5e9');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // 背景齿轮圈
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = s * 0.02;
  [[0.14, 0.16, 0.1], [0.88, 0.82, 0.13], [0.85, 0.14, 0.07]].forEach(([fx, fy, fr]) => {
    ctx.beginPath(); ctx.arc(s * fx, s * fy, s * fr, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([s * 0.03, s * 0.028]);
    ctx.beginPath(); ctx.arc(s * fx, s * fy, s * (fr + 0.03), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  });
  const cx = s / 2;
  // 天线
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = s * 0.02;
  ctx.beginPath(); ctx.moveTo(cx, s * 0.28); ctx.lineTo(cx, s * 0.17); ctx.stroke();
  ctx.fillStyle = '#f87171'; ctx.beginPath(); ctx.arc(cx, s * 0.15, s * 0.035, 0, Math.PI * 2); ctx.fill();
  // 耳罩
  ctx.fillStyle = '#fbbf24';
  rr(ctx, cx - s * 0.36, s * 0.44, s * 0.06, s * 0.16, s * 0.02); ctx.fill();
  rr(ctx, cx + s * 0.3, s * 0.44, s * 0.06, s * 0.16, s * 0.02); ctx.fill();
  // 头壳
  ctx.fillStyle = '#cbd5e1';
  rr(ctx, cx - s * 0.3, s * 0.28, s * 0.6, s * 0.48, s * 0.07); ctx.fill();
  ctx.strokeStyle = '#64748b'; ctx.lineWidth = s * 0.012;
  rr(ctx, cx - s * 0.3, s * 0.28, s * 0.6, s * 0.48, s * 0.07); ctx.stroke();
  // 屏幕脸 + 发光眼
  ctx.fillStyle = '#0f172a';
  rr(ctx, cx - s * 0.24, s * 0.34, s * 0.48, s * 0.24, s * 0.05); ctx.fill();
  ctx.fillStyle = '#22d3ee';
  [-1, 1].forEach(d => { ctx.beginPath(); ctx.arc(cx + d * s * 0.11, s * 0.45, s * 0.045, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = 'rgba(34,211,238,.35)';
  [-1, 1].forEach(d => { ctx.beginPath(); ctx.arc(cx + d * s * 0.11, s * 0.45, s * 0.075, 0, Math.PI * 2); ctx.fill(); });
  // 嘴：格栅
  ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = s * 0.014;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.1 + i * s * 0.1, s * 0.64);
    ctx.lineTo(cx - s * 0.1 + i * s * 0.1, s * 0.7);
    ctx.stroke();
  }
  // 铆钉
  ctx.fillStyle = '#64748b';
  [[-0.26, 0.32], [0.26, 0.32], [-0.26, 0.7], [0.26, 0.7]].forEach(([dx, dy]) => {
    ctx.beginPath(); ctx.arc(cx + dx * s, s * dy, s * 0.014, 0, Math.PI * 2); ctx.fill();
  });
  // 下方指示灯
  ['#4ade80', '#fbbf24', '#f87171'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(cx + (i - 1) * s * 0.09, s * 0.85, s * 0.025, 0, Math.PI * 2); ctx.fill();
  });
}

function drawCupcake(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#fdf2f8'); g.addColorStop(1, '#fbcfe8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // 波点背景
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  const rng = seededRng(88);
  for (let i = 0; i < 16; i++) {
    ctx.beginPath(); ctx.arc(rng() * s, rng() * s, s * (0.012 + rng() * 0.02), 0, Math.PI * 2); ctx.fill();
  }
  const cx = s / 2;
  // 纸托（梯形 + 竖棱）
  ctx.fillStyle = '#ec4899';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.26, s * 0.56);
  ctx.lineTo(cx + s * 0.26, s * 0.56);
  ctx.lineTo(cx + s * 0.19, s * 0.84);
  ctx.lineTo(cx - s * 0.19, s * 0.84);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#be185d'; ctx.lineWidth = s * 0.012;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * s * 0.1, s * 0.57);
    ctx.lineTo(cx + i * s * 0.075, s * 0.83);
    ctx.stroke();
  }
  // 奶油三层
  ctx.fillStyle = '#fef9c3';
  [[0.5, 0.26, 3], [0.4, 0.17, 2], [0.3, 0.09, 1]].forEach(([wf, yOff]) => {
    const w = s * wf, y = s * (0.56 - yOff);
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y);
    ctx.arc(cx - w / 4, y, w / 4, Math.PI, 0);
    ctx.arc(cx + w / 4, y, w / 4, Math.PI, 0);
    ctx.closePath(); ctx.fill();
  });
  ctx.fillStyle = '#fef08a';
  ctx.beginPath(); ctx.arc(cx, s * 0.3, s * 0.09, Math.PI, 0); ctx.fill();
  // 樱桃 + 高光
  ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(cx, s * 0.22, s * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(cx - s * 0.02, s * 0.2, s * 0.017, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#166534'; ctx.lineWidth = s * 0.012;
  ctx.beginPath(); ctx.moveTo(cx, s * 0.16); ctx.quadraticCurveTo(cx + s * 0.04, s * 0.11, cx + s * 0.06, s * 0.08); ctx.stroke();
  // 彩针糖屑
  const cols = ['#f87171', '#60a5fa', '#4ade80', '#c084fc', '#fb923c'];
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const px = cx + (rng() - 0.5) * s * 0.4, py = s * (0.3 + rng() * 0.22);
    ctx.save();
    ctx.translate(px, py); ctx.rotate(a);
    ctx.fillStyle = cols[i % cols.length];
    rr(ctx, -s * 0.016, -s * 0.005, s * 0.032, s * 0.01, s * 0.005); ctx.fill();
    ctx.restore();
  }
}

function drawCity(ctx, s) {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#0f172a'); g.addColorStop(0.7, '#1e3a8a'); g.addColorStop(1, '#7c3aed');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const rng = seededRng(2077);
  // 星星 + 弯月
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + rng() * 0.6) + ')';
    ctx.beginPath(); ctx.arc(rng() * s, rng() * s * 0.5, s * 0.005, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#fef9c3';
  ctx.beginPath(); ctx.arc(s * 0.8, s * 0.16, s * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath(); ctx.arc(s * 0.84, s * 0.13, s * 0.075, 0, Math.PI * 2); ctx.fill();
  // 楼群剪影 + 亮窗
  const buildings = [
    [0.0, 0.5, 0.14, '#1e293b'], [0.13, 0.36, 0.16, '#334155'], [0.28, 0.55, 0.12, '#1e293b'],
    [0.39, 0.3, 0.18, '#475569'], [0.56, 0.48, 0.13, '#334155'], [0.68, 0.4, 0.15, '#1e293b'],
    [0.82, 0.58, 0.18, '#334155']
  ];
  buildings.forEach(([fx, fy, fw, color]) => {
    const bx = s * fx, by = s * fy, bw = s * fw;
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, bw, s - by);
    // 亮窗（霓虹色随机点亮）
    const winCols = ['#fde047', '#fde047', '#fde047', '#22d3ee', '#f472b6'];
    const cw = bw / 4;
    for (let r = 0; ; r++) {
      const wy = by + s * 0.03 + r * s * 0.055;
      if (wy + s * 0.03 > s * 0.97) break;
      for (let c = 0; c < 3; c++) {
        if (rng() < 0.45) continue;   // 部分窗户熄灯
        ctx.fillStyle = winCols[Math.floor(rng() * winCols.length)];
        ctx.fillRect(bx + cw * 0.55 + c * cw, wy, cw * 0.5, s * 0.03);
      }
    }
  });
  // 楼顶警示灯
  ctx.fillStyle = '#f87171';
  ctx.beginPath(); ctx.arc(s * 0.48, s * 0.29, s * 0.012, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(248,113,113,.3)';
  ctx.beginPath(); ctx.arc(s * 0.48, s * 0.29, s * 0.03, 0, Math.PI * 2); ctx.fill();
}

// 关卡表：图案 × 网格递进；idx 越大越难，逐关解锁
const LEVELS = [
  { id: 'melon',     name: '夏日西瓜', icon: '🍉', grid: 3, draw: drawMelon },
  { id: 'sunflower', name: '向阳花开', icon: '🌻', grid: 3, draw: drawSunflower },
  { id: 'panda',     name: '滚滚熊猫', icon: '🐼', grid: 4, draw: drawPanda },
  { id: 'rainbow',   name: '雨后彩虹', icon: '🌈', grid: 4, draw: drawRainbow },
  { id: 'rocket',    name: '星际火箭', icon: '🚀', grid: 4, draw: drawRocket },
  { id: 'cat',       name: '元气橘猫', icon: '🐱', grid: 4, draw: drawCat },
  { id: 'robot',     name: '呆萌机器人', icon: '🤖', grid: 4, draw: drawRobot },
  { id: 'sakura',    name: '樱夜月色', icon: '🌸', grid: 5, draw: drawSakura },
  { id: 'cupcake',   name: '甜心蛋糕', icon: '🧁', grid: 5, draw: drawCupcake },
  { id: 'city',      name: '霓虹都市', icon: '🌃', grid: 5, draw: drawCity }
];

Page({
  data: {
    phase: 'menu',           // menu | playing | win
    statusBarHeight: 20,
    hudTop: 44,              // HUD 顶部基线（胶囊按钮下沿），onLoad 实测后更新
    levelList: [],
    levelName: '',
    levelIcon: '',
    moves: 0,
    timeStr: '00:00',
    bestText: '',
    winMoves: 0,
    winTime: '',
    winIsNew: false,
    hasNext: false
  },

  onLoad() {
    const winInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    // HUD 顶部基线：贴着右上角胶囊按钮下沿，避免与胶囊/系统时间重叠
    let hudTop = (winInfo.statusBarHeight || 20) + 12;
    if (wx.getMenuButtonBoundingClientRect) {
      try {
        const mb = wx.getMenuButtonBoundingClientRect();
        if (mb && mb.bottom) hudTop = mb.bottom + 10;
      } catch (e) { /* 个别环境不支持，退回状态栏高度 */ }
    }
    this.setData({ statusBarHeight: winInfo.statusBarHeight || 20, hudTop });

    this.destroyed = false;
    this.state = 'idle';      // idle | playing | won
    this.actx = null;
    this.levelIdx = -1;
    this.curLevel = null;
    this.particles = [];
    this.peek = false;

    this.best = wx.getStorageSync(BEST_KEY) || {};
    this.unlocked = wx.getStorageSync(UNLOCK_KEY) || 1;
    this.refreshLevelList();
    this.initCanvas();
  },

  onUnload() {
    this.destroyed = true;
    if (this.rafId && this.canvas) this.canvas.cancelAnimationFrame(this.rafId);
    if (this.actx && this.actx.close) { try { this.actx.close(); } catch (e) { /* 忽略 */ } }
  },

  refreshLevelList() {
    this.setData({
      levelList: LEVELS.map((L, i) => ({
        icon: L.icon,
        name: L.name,
        gridLabel: L.grid + '×' + L.grid,
        best: this.best[L.id] || 0,
        locked: i + 1 > this.unlocked
      }))
    });
  },

  // ==================== Canvas ====================
  initCanvas() {
    wx.createSelectorQuery()
      .select('#game')
      .fields({ node: true, size: true })
      .exec(res => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = this.dpr = Math.min(info.pixelRatio || 1, 2);
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.vw = res[0].width;
        this.vh = res[0].height;
        canvas.width = this.vw * dpr;
        canvas.height = this.vh * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // 棋盘区域：水平居中，略高于屏幕中心
        this.boardSize = Math.min(this.vw * 0.92, this.vh * 0.56);
        this.boardX = (this.vw - this.boardSize) / 2;
        this.boardY = (this.vh - this.boardSize) / 2 - this.vh * 0.03;

        this.lastT = now();
        const loop = () => {
          if (this.destroyed) return;
          this.tick();
          this.rafId = canvas.requestAnimationFrame(loop);
        };
        this.rafId = canvas.requestAnimationFrame(loop);
      });
  },

  // 图案绘到离屏画布，方块用 drawImage 取各自区域；不支持离屏时降级为色块+数字
  buildPattern(level) {
    const px = Math.max(2, Math.floor(this.boardSize * this.dpr));
    this.patCanvas = null;
    if (wx.createOffscreenCanvas) {
      try {
        const oc = wx.createOffscreenCanvas({ type: '2d', width: px, height: px });
        const ctx = oc.getContext('2d');
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        level.draw(ctx, this.boardSize);
        this.patCanvas = oc;
        this.patSize = px;
      } catch (e) { this.patCanvas = null; }
    }
  },

  // ==================== 音效 ====================
  getAudioCtx() {
    if (!this.actx) this.actx = wx.createWebAudioContext();
    if (this.actx.state === 'suspended' && this.actx.resume) this.actx.resume();
    return this.actx;
  },
  beep(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
    if (this.destroyed) return;
    try {
      const actx = this.getAudioCtx();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), actx.currentTime + dur);
      g.gain.setValueAtTime(Math.min(0.5, vol * SFX_GAIN), actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* 忽略音频错误 */ }
  },
  sfxSlide() { this.beep(340, .06, 'triangle', .12, -80); },
  sfxClick() { this.beep(600, .07, 'triangle', .12, 120); },
  sfxDeny() { this.beep(160, .12, 'sawtooth', .1, -40); },
  sfxWin() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.beep(f, i === 4 ? .4 : .13, 'square', .12), i * 90)); },

  // ==================== 对局流程 ====================
  onSelectLevel(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (idx + 1 > this.unlocked) {
      this.sfxDeny();
      wx.showToast({ title: '先通过上一关解锁', icon: 'none' });
      return;
    }
    this.sfxClick();
    this.startLevel(idx);
  },

  // ==================== 照片关卡（相册选图，仅本机游玩，无版权风险） ====================
  onPickPhoto() {
    // 照片切块依赖离屏画布，老基础库不支持
    if (!wx.createOffscreenCanvas) {
      wx.showToast({ title: '微信版本过低，暂不支持照片拼图', icon: 'none' });
      return;
    }
    this.sfxClick();
    const onPath = path => {
      wx.showActionSheet({
        itemList: ['3×3 · 轻松', '4×4 · 进阶', '5×5 · 大师'],
        success: r => this.startPhotoLevel(path, [3, 4, 5][r.tapIndex])
      });
    };
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1, mediaType: ['image'],
        success: res => onPath(res.tempFiles[0].tempFilePath)
      });
    } else {
      wx.chooseImage({ count: 1, success: res => onPath(res.tempFilePaths[0]) });
    }
  },

  startPhotoLevel(path, grid) {
    if (!this.boardSize) {
      if (!this.destroyed) setTimeout(() => { if (!this.destroyed) this.startPhotoLevel(path, grid); }, 150);
      return;
    }
    const px = Math.max(2, Math.floor(this.boardSize * this.dpr));
    const oc = wx.createOffscreenCanvas({ type: '2d', width: px, height: px });
    const octx = oc.getContext('2d');
    const img = oc.createImage();
    wx.showLoading({ title: '加载照片…' });
    img.onload = () => {
      wx.hideLoading();
      if (this.destroyed) return;
      // 居中方形裁剪铺满棋盘
      const side = Math.min(img.width, img.height);
      octx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, px, px);
      this.patCanvas = oc;
      this.patSize = px;
      this.curLevel = { id: 'photo-' + grid, name: '我的照片', icon: '📷', grid: grid };
      this.levelIdx = -2;        // 照片关：不参与解锁/下一关
      this.n = grid;
      this.newGame();
      this.setData({
        phase: 'playing',
        levelName: '我的照片',
        levelIcon: '📷',
        moves: 0, timeStr: '00:00',
        bestText: this.best[this.curLevel.id] ? '最佳 ' + this.best[this.curLevel.id] + ' 步' : '尚无纪录'
      });
    };
    img.onerror = () => {
      wx.hideLoading();
      wx.showToast({ title: '照片加载失败', icon: 'none' });
    };
    img.src = path;
  },

  startLevel(idx) {
    // Canvas 未就绪时稍后重试，避免棋盘坐标缺失
    if (!this.boardSize) {
      if (!this.destroyed) setTimeout(() => { if (!this.destroyed) this.startLevel(idx); }, 150);
      return;
    }
    const L = LEVELS[idx];
    this.levelIdx = idx;
    this.curLevel = L;         // 当前关卡（图案关 / 照片关通用）
    this.n = L.grid;
    this.buildPattern(L);
    this.newGame();
    this.setData({
      phase: 'playing',
      levelName: L.name,
      levelIcon: L.icon,
      moves: 0,
      timeStr: '00:00',
      bestText: this.best[L.id] ? '最佳 ' + this.best[L.id] + ' 步' : '尚无纪录'
    });
  },

  newGame() {
    const n = this.n, total = n * n;
    // cells[格子] = 拼块编号（拼块 i 的家就是格子 i），-1 为空位
    this.cells = [];
    for (let i = 0; i < total - 1; i++) this.cells.push(i);
    this.cells.push(-1);
    this.shuffle();
    // 动画位置：拼块 → 像素坐标，初始直接落位
    this.pos = {};
    for (let i = 0; i < total; i++) {
      const p = this.cells[i];
      if (p >= 0) { const rc = this.cellRect(i); this.pos[p] = { x: rc.x, y: rc.y, tx: rc.x, ty: rc.y }; }
    }
    this.state = 'playing';
    this.moves = 0;
    this.startAt = 0;          // 首次移动才开始计时
    this.lastSec = -1;
    this.particles = [];
    this.peek = false;
  },

  // 随机合法移动洗牌（避免立即回退上一步），必然有解
  shuffle() {
    const n = this.n;
    let empty = n * n - 1, last = -1;
    const steps = n * n * 14;
    for (let i = 0; i < steps; i++) {
      const er = Math.floor(empty / n), ec = empty % n;
      const cand = [];
      if (er > 0) cand.push(empty - n);
      if (er < n - 1) cand.push(empty + n);
      if (ec > 0) cand.push(empty - 1);
      if (ec < n - 1) cand.push(empty + 1);
      const pickable = cand.filter(c => c !== last);
      const c = pickable[Math.floor(Math.random() * pickable.length)];
      this.cells[empty] = this.cells[c];
      this.cells[c] = -1;
      last = empty;
      empty = c;
    }
    if (this.isSolved()) this.shuffle();   // 洗完恰好复原（概率极低）则重洗
  },

  isSolved() {
    for (let i = 0; i < this.cells.length - 1; i++) if (this.cells[i] !== i) return false;
    return true;
  },

  cellRect(idx) {
    const n = this.n, gap = 3;
    const tile = (this.boardSize - gap * (n + 1)) / n;
    const r = Math.floor(idx / n), c = idx % n;
    return { x: this.boardX + gap + c * (tile + gap), y: this.boardY + gap + r * (tile + gap), w: tile };
  },

  // 点击棋盘：与空位同行/列则整段推动（华容道式），一次点击算 1 步
  onCanvasTouch(e) {
    if (this.state !== 'playing' || this.peek) return;
    const t = e.touches && e.touches[0];
    if (!t || !this.boardSize) return;
    const n = this.n, gap = 3;
    const tile = (this.boardSize - gap * (n + 1)) / n;
    const c = Math.floor((t.clientX - this.boardX - gap) / (tile + gap));
    const r = Math.floor((t.clientY - this.boardY - gap) / (tile + gap));
    if (r < 0 || r >= n || c < 0 || c >= n) return;
    const idx = r * n + c;
    const eIdx = this.cells.indexOf(-1);
    if (idx === eIdx) return;
    const er = Math.floor(eIdx / n), ec = eIdx % n;
    if (r !== er && c !== ec) { this.sfxDeny(); return; }   // 不同行列推不动

    // 空位沿点击方向逐格吞进来：段内每块向空位移一格
    const step = r === er ? (idx < eIdx ? -1 : 1) : (idx < eIdx ? -n : n);
    let cur = eIdx;
    while (cur !== idx) {
      const next = cur + step;
      this.cells[cur] = this.cells[next];
      this.cells[next] = -1;
      cur = next;
    }
    // 同步动画目标
    for (let i = 0; i < this.cells.length; i++) {
      const p = this.cells[i];
      if (p >= 0) { const rc = this.cellRect(i); this.pos[p].tx = rc.x; this.pos[p].ty = rc.y; }
    }
    this.sfxSlide();
    this.moves++;
    if (!this.startAt) this.startAt = now();
    this.setData({ moves: this.moves });

    if (this.isSolved()) this.onWin();
  },

  onWin() {
    this.state = 'won';
    const L = this.curLevel;
    const prev = this.best[L.id] || 0;
    const isNew = !prev || this.moves < prev;
    if (isNew) {
      this.best[L.id] = this.moves;
      wx.setStorageSync(BEST_KEY, this.best);
    }
    // 照片关（levelIdx < 0）不参与解锁进度
    if (this.levelIdx >= 0 && this.levelIdx + 2 > this.unlocked) {
      this.unlocked = Math.min(LEVELS.length, this.levelIdx + 2);
      wx.setStorageSync(UNLOCK_KEY, this.unlocked);
    }
    this.refreshLevelList();
    this.spawnConfetti();
    this.sfxWin();
    // 等最后一块滑到位再弹结算
    setTimeout(() => {
      if (this.destroyed) return;
      this.setData({
        phase: 'win',
        winMoves: this.moves,
        winTime: this.data.timeStr,
        winIsNew: isNew,
        hasNext: this.levelIdx >= 0 && this.levelIdx + 1 < LEVELS.length,
        winAllClear: this.levelIdx >= 0 && this.levelIdx + 1 >= LEVELS.length
      });
    }, 450);
  },

  spawnConfetti() {
    const colors = ['#fbbf24', '#f472b6', '#4ade80', '#38bdf8', '#a78bfa'];
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 260;
      this.particles.push({
        x: this.vw / 2, y: this.boardY + this.boardSize / 2,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
        life: 1 + Math.random() * 0.5,
        color: colors[i % colors.length],
        r: 2 + Math.random() * 4
      });
    }
  },

  // ==================== 渲染 ====================
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  tick() {
    const t = now();
    const dt = Math.min(0.033, (t - this.lastT) / 1000);
    this.lastT = t;
    const ctx = this.ctx;
    if (!ctx) return;

    // 计时（每秒才 setData 一次）
    if (this.state === 'playing' && this.startAt) {
      const sec = Math.floor((t - this.startAt) / 1000);
      if (sec !== this.lastSec) {
        this.lastSec = sec;
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        this.setData({ timeStr: mm + ':' + ss });
      }
    }

    // 背景
    const g = ctx.createLinearGradient(0, 0, 0, this.vh);
    g.addColorStop(0, '#1e1b4b'); g.addColorStop(0.6, '#4c1d95'); g.addColorStop(1, '#831843');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, this.vh);

    if (this.curLevel && this.boardSize) {
      // 棋盘底板
      ctx.fillStyle = 'rgba(15,23,42,.55)';
      this.roundRect(ctx, this.boardX - 8, this.boardY - 8, this.boardSize + 16, this.boardSize + 16, 14);
      ctx.fill();

      if (this.peek && this.patCanvas) {
        // 按住看原图：整幅图案直接铺满棋盘
        ctx.save();
        this.roundRect(ctx, this.boardX, this.boardY, this.boardSize, this.boardSize, 8);
        ctx.clip();
        ctx.drawImage(this.patCanvas, 0, 0, this.patSize, this.patSize, this.boardX, this.boardY, this.boardSize, this.boardSize);
        ctx.restore();
      } else {
        this.drawTiles(dt);
      }
    }

    // 彩带粒子
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 320 * dt;
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  drawTiles(dt) {
    const ctx = this.ctx, n = this.n;
    const total = n * n, srcTile = this.patCanvas ? this.patSize / n : 0;
    const k = Math.min(1, dt * 16);   // 滑动缓动

    for (let i = 0; i < total; i++) {
      const p = this.cells[i];
      if (p < 0) continue;
      const rc = this.cellRect(i);
      const pos = this.pos[p];
      pos.x += (pos.tx - pos.x) * k;
      pos.y += (pos.ty - pos.y) * k;
      const x = pos.x, y = pos.y, w = rc.w;
      const hr = Math.floor(p / n), hc = p % n;   // 拼块的"家"（图案取样位置）

      ctx.save();
      this.roundRect(ctx, x, y, w, w, 6);
      ctx.clip();
      if (this.patCanvas) {
        ctx.drawImage(this.patCanvas, hc * srcTile, hr * srcTile, srcTile, srcTile, x, y, w, w);
      } else {
        // 离屏画布不可用的降级：色块 + 大数字
        const hue = (p * 47) % 360;
        ctx.fillStyle = 'hsl(' + hue + ', 65%, 55%)';
        ctx.fillRect(x, y, w, w);
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.font = '700 ' + w * 0.4 + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(p + 1), x + w / 2, y + w / 2);
      }
      ctx.restore();

      // 描边：已归位的块亮绿描边给正反馈
      const home = this.cells[i] === i;
      ctx.strokeStyle = home ? 'rgba(74,222,128,.9)' : 'rgba(255,255,255,.28)';
      ctx.lineWidth = home ? 2 : 1;
      this.roundRect(ctx, x, y, w, w, 6);
      ctx.stroke();

      // 角标编号（辅助推理）
      if (this.patCanvas) {
        const br = Math.max(9, w * 0.13);
        ctx.fillStyle = 'rgba(15,23,42,.6)';
        ctx.beginPath(); ctx.arc(x + br * 0.9, y + br * 0.9, br * 0.72, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '600 ' + br * 0.82 + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(p + 1), x + br * 0.9, y + br * 0.95);
      }
    }
  },

  // ==================== UI 事件 ====================
  restart() {
    this.sfxClick();
    this.newGame();
    // bestText 需重取：可能刚在结算里刷新了纪录
    const L = this.curLevel;
    this.setData({
      phase: 'playing', moves: 0, timeStr: '00:00',
      bestText: this.best[L.id] ? '最佳 ' + this.best[L.id] + ' 步' : '尚无纪录'
    });
  },
  nextLevel() {
    if (this.levelIdx < 0 || this.levelIdx + 1 >= LEVELS.length) return;
    this.sfxClick();
    this.startLevel(this.levelIdx + 1);
  },
  openLevels() {
    this.sfxClick();
    this.state = 'idle';
    this.setData({ phase: 'menu' });
  },
  peekOn() { if (this.state === 'playing') this.peek = true; },
  peekOff() { this.peek = false; },
  onBackHome() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    });
  },
  noop() {}
});
