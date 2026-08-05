// 魔方大师：Canvas 2D 手写 3D 渲染的魔方还原游戏（2/3/4/5 阶）
// 模型：6 面 × N×N 颜色网格；层转动 = 贴纸坐标绕轴 90° 置换
// 交互：空白处拖拽转视角；贴纸面上沿某方向滑动 = 对应层转 90°；一键重置 = 重新打乱
// 渲染：正交投影 + 画家算法按深度排序，转动层带连续旋转动画

const BEST_KEY = 'cubeBest';
const UNLOCK_KEY = 'cubeUnlocked';
const SFX_GAIN = 1;

function now() { return Date.now(); }

// 六面颜色：U白 D黄 F绿 B蓝 R红 L橙
const COLORS = ['#f1f5f9', '#facc15', '#22c55e', '#3b82f6', '#ef4444', '#fb923c'];

// 面定义：axis 法线轴（0=x 1=y 2=z），sign 法线方向，up 该面网格"上"方向（世界轴）
const FACES = [
  { id: 'U', axis: 1, sign: 1,  up: [0, 0, -1] },
  { id: 'D', axis: 1, sign: -1, up: [0, 0, 1] },
  { id: 'F', axis: 2, sign: 1,  up: [0, 1, 0] },
  { id: 'B', axis: 2, sign: -1, up: [0, 1, 0] },
  { id: 'R', axis: 0, sign: 1,  up: [0, 1, 0] },
  { id: 'L', axis: 0, sign: -1, up: [0, 1, 0] }
];

const LEVELS = [
  { id: 'n2', n: 2, name: '二阶魔方', icon: '⬜', scrambleMoves: 9 },
  { id: 'n3', n: 3, name: '三阶魔方', icon: '🧊', scrambleMoves: 14 },
  { id: 'n4', n: 4, name: '四阶魔方', icon: '🟦', scrambleMoves: 20 },
  { id: 'n5', n: 5, name: '五阶魔方', icon: '🟥', scrambleMoves: 26 }
];

// 光照方向（视空间）
const LIGHT = (() => {
  const v = [0.45, 0.7, 0.75];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
})();

// ==================== 向量工具 ====================
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function vScale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function vAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

// 绕轴 90° 整数旋转（dir=+1 逆时针按右手定则，dir=-1 转三次）
function quarter(v, axis) {
  if (axis === 0) return [v[0], -v[2], v[1]];
  if (axis === 1) return [v[2], v[1], -v[0]];
  return [-v[1], v[0], v[2]];
}
function rotVec(v, axis, dir) {
  let r = v;
  const times = dir > 0 ? 1 : 3;
  for (let i = 0; i < times; i++) r = quarter(r, axis);
  return r;
}
// 绕轴任意角度旋转（动画用）
function rotVecAngle(v, axis, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const x = v[0], y = v[1], z = v[2];
  if (axis === 0) return [x, y * c - z * s, y * s + z * c];
  if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}
function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

// 颜色明暗缓存（数量有限：6色 × 少量档位）
const shadeCache = {};
function shadeColor(hex, f) {
  const key = hex + f.toFixed(2);
  if (shadeCache[key]) return shadeCache[key];
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const c = 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')';
  shadeCache[key] = c;
  return c;
}

// 凸四边形包含检测
function ptInQuad(x, y, pts) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    const cr = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (Math.abs(cr) < 0.001) continue;
    const sg = cr > 0 ? 1 : -1;
    if (s === 0) s = sg;
    else if (sg !== s) return false;
  }
  return true;
}

Page({
  data: {
    phase: 'menu',           // menu | playing | win
    hudTop: 44,
    levelList: [],
    levelName: '',
    levelIcon: '',
    bestText: '',
    moves: 0,
    timeStr: '00:00',
    winMoves: 0,
    winTime: '',
    winIsNew: false,
    hasNext: false,
    winAllClear: false
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
    this.setData({ hudTop });

    this.destroyed = false;
    this.state = 'idle';      // idle | playing | won
    this.actx = null;
    this.levelIdx = -1;
    this.curLevel = null;
    this.particles = [];
    this.anim = null;         // 层转动动画 {axis, layer, dir, t, dur}
    this.touchMode = 'none';
    this.yaw = -0.62;         // 初始视角：右前上 三面对人
    this.pitch = 0.42;

    // 菜单页展示用：三阶还原态魔方缓慢自转
    this.n = 3;
    this.faces = this.solvedFaces(3);
    this.demoMode = true;

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
        gridLabel: L.n + ' 阶',
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

        // 魔方显示区域：水平居中，略高于屏幕中心
        this.boardSize = Math.min(this.vw * 0.9, this.vh * 0.52);
        this.boardX = (this.vw - this.boardSize) / 2;
        this.boardY = (this.vh - this.boardSize) / 2 - this.vh * 0.02;
        this.hitQuads = [];

        this.lastT = now();
        const loop = () => {
          if (this.destroyed) return;
          this.tick();
          this.rafId = canvas.requestAnimationFrame(loop);
        };
        this.rafId = canvas.requestAnimationFrame(loop);
      });
  },

  // ==================== 音效 ====================
  getAudioCtx() {
    if (!this.actx && wx.createWebAudioContext) {
      try { this.actx = wx.createWebAudioContext(); } catch (e) { /* 不支持则静音 */ }
    }
    return this.actx;
  },
  beep(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
    if (this.destroyed) return;
    try {
      const actx = this.getAudioCtx();
      if (!actx) return;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), actx.currentTime + dur);
      g.gain.setValueAtTime(Math.min(0.5, vol * SFX_GAIN), actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* 忽略音频错误 */ }
  },
  sfxSlide() { this.beep(300, .06, 'triangle', .13, -60); },
  sfxClick() { this.beep(600, .07, 'triangle', .12, 120); },
  sfxDeny() { this.beep(160, .12, 'sawtooth', .1, -40); },
  sfxWin() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.beep(f, i === 4 ? .4 : .13, 'square', .12), i * 90)); },

  // ==================== 魔方模型 ====================
  solvedFaces(n) { return FACES.map((f, i) => new Array(n * n).fill(i)); },

  // 贴纸中心坐标（2 倍整数坐标，避免半格小数）与法线
  stickerPos(fi, r, c) {
    const N = this.n, f = FACES[fi];
    const n = [0, 0, 0]; n[f.axis] = f.sign;
    const right = cross(f.up, n);
    const p = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      p[i] = n[i] * (N - 1) + f.up[i] * ((N - 1) - 2 * r) + right[i] * (2 * c - (N - 1));
    }
    return { p, n };
  },

  // 层转动：把该层贴纸坐标整体绕轴转 90°，重映射回 6 面网格
  rotateSlice(axis, layer, dir) {
    const N = this.n, k = -(N - 1) + 2 * layer;
    const old = this.faces;
    const next = old.map(g => g.slice());
    FACES.forEach((f, fi) => {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const { p, n } = this.stickerPos(fi, r, c);
          if (p[axis] !== k) continue;
          const p2 = rotVec(p, axis, dir), n2 = rotVec(n, axis, dir);
          const fi2 = FACES.findIndex(g => n2[g.axis] === g.sign &&
            n2[(g.axis + 1) % 3] === 0 && n2[(g.axis + 2) % 3] === 0);
          const f2 = FACES[fi2];
          const n2v = [0, 0, 0]; n2v[f2.axis] = f2.sign;
          const right2 = cross(f2.up, n2v);
          const r2 = ((N - 1) - dot(p2, f2.up)) / 2;
          const c2 = (dot(p2, right2) + (N - 1)) / 2;
          next[fi2][r2 * N + c2] = old[fi][r * N + c];
        }
      }
    });
    this.faces = next;
  },

  isSolved() { return this.faces.every(g => g.every(c => c === g[0])); },

  // 随机打乱（避免紧邻的上一步被直接撤销；必然非还原态）
  scramble() {
    const L = this.curLevel || LEVELS[1];
    const N = this.n;
    let lastAxis = -1, lastLayer = -1, lastDir = 0;
    for (let i = 0; i < L.scrambleMoves; i++) {
      let axis, layer, dir;
      do {
        axis = Math.floor(Math.random() * 3);
        layer = Math.floor(Math.random() * N);
        dir = Math.random() < 0.5 ? 1 : -1;
      } while (axis === lastAxis && layer === lastLayer && dir === -lastDir);
      this.rotateSlice(axis, layer, dir);
      lastAxis = axis; lastLayer = layer; lastDir = dir;
    }
    if (this.isSolved()) this.scramble();
  },

  // ==================== 对局流程 ====================
  onSelectLevel(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (idx + 1 > this.unlocked) {
      this.sfxDeny();
      wx.showToast({ title: '先通过上一阶解锁', icon: 'none' });
      return;
    }
    this.sfxClick();
    this.startLevel(idx);
  },

  startLevel(idx) {
    const L = LEVELS[idx];
    this.levelIdx = idx;
    this.curLevel = L;
    this.demoMode = false;
    this.n = L.n;
    this.faces = this.solvedFaces(L.n);
    this.scramble();
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
    this.state = 'playing';
    this.moves = 0;
    this.anim = null;
    this.touchMode = 'none';
    this.timeStart = now();
    this.lastSec = 0;
    this.particles = [];
  },

  // 一键重置：重新打乱为混乱状态，重新开始还原
  onScrambleReset() {
    if (!this.curLevel || this.state !== 'playing' || this.anim) return;
    this.sfxClick();
    this.faces = this.solvedFaces(this.n);
    this.scramble();
    this.moves = 0;
    this.timeStart = now();
    this.lastSec = 0;
    this.setData({ moves: 0, timeStr: '00:00' });
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
  },

  openLevels() {
    this.sfxClick();
    this.state = 'idle';
    // 回选关页：摆一个还原态展示魔方
    this.demoMode = true;
    this.n = 3;
    this.faces = this.solvedFaces(3);
    this.setData({ phase: 'menu' });
  },

  restart() {
    this.sfxClick();
    this.faces = this.solvedFaces(this.n);
    this.scramble();
    this.newGame();
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

  onBackHome() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    });
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
    if (this.levelIdx + 2 > this.unlocked) {
      this.unlocked = Math.min(LEVELS.length, this.levelIdx + 2);
      wx.setStorageSync(UNLOCK_KEY, this.unlocked);
    }
    this.refreshLevelList();
    this.spawnConfetti();
    this.sfxWin();
    setTimeout(() => {
      if (this.destroyed) return;
      this.setData({
        phase: 'win',
        winMoves: this.moves,
        winTime: this.data.timeStr,
        winIsNew: isNew,
        hasNext: this.levelIdx + 1 < LEVELS.length,
        winAllClear: this.levelIdx + 1 >= LEVELS.length
      });
    }, 500);
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

  // ==================== 触摸交互 ====================
  onTouchStart(e) {
    const t = e.touches[0];
    const x = t.clientX, y = t.clientY;
    // 非对局中或转动动画未结束：只允许转视角
    if (this.state !== 'playing' || this.anim) {
      this.touchMode = 'orbit';
      this.lastX = x; this.lastY = y;
      return;
    }
    const hit = this.pick(x, y);
    if (hit) {
      this.touchMode = 'layer';
      this.layerTouch = {
        hit, x0: x, y0: y, moved: false,
        tu: this.screenDir(hit.up),
        tv: this.screenDir(hit.right)
      };
    } else {
      this.touchMode = 'orbit';
      this.lastX = x; this.lastY = y;
    }
  },

  onTouchMove(e) {
    const t = e.touches[0];
    const x = t.clientX, y = t.clientY;
    if (this.touchMode === 'orbit') {
      this.yaw += (x - this.lastX) * 0.009;
      this.pitch += (y - this.lastY) * 0.009;
      this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch));
      this.lastX = x; this.lastY = y;
    } else if (this.touchMode === 'layer') {
      const lt = this.layerTouch;
      if (!lt || lt.moved || this.anim) return;
      const dx = x - lt.x0, dy = y - lt.y0;
      // 把屏幕滑动量投影到贴纸面的两个切向，取主导方向
      const du = dx * lt.tu.x + dy * lt.tu.y;
      const dv = dx * lt.tv.x + dy * lt.tv.y;
      if (Math.max(Math.abs(du), Math.abs(dv)) < 24) return;
      const s3 = Math.abs(du) > Math.abs(dv)
        ? vScale(lt.hit.up, du > 0 ? 1 : -1)
        : vScale(lt.hit.right, dv > 0 ? 1 : -1);
      // 转轴 = 法线 × 滑动方向；再按"贴纸初速度沿滑动方向"校正符号
      let a3 = cross(lt.hit.n, s3);
      const c3 = [lt.hit.p[0] / 2, lt.hit.p[1] / 2, lt.hit.p[2] / 2];
      if (dot(cross(a3, c3), s3) < 0) a3 = vScale(a3, -1);
      const axisIdx = Math.abs(a3[0]) > 0.5 ? 0 : Math.abs(a3[1]) > 0.5 ? 1 : 2;
      const dir = a3[axisIdx] > 0 ? 1 : -1;
      const layer = (lt.hit.p[axisIdx] + (this.n - 1)) / 2;
      lt.moved = true;
      this.anim = { axis: axisIdx, layer, dir, t: 0, dur: 0.22 };
      this.sfxSlide();
    }
  },

  onTouchEnd() { this.touchMode = 'none'; this.layerTouch = null; },

  // 从最近到最远找第一个命中的贴纸
  pick(x, y) {
    for (let i = this.hitQuads.length - 1; i >= 0; i--) {
      const q = this.hitQuads[i];
      if (ptInQuad(x, y, q.pts)) return q;
    }
    return null;
  },

  // 3D 方向投影到屏幕并归一化
  screenDir(dir3) {
    const scale = this.curScale();
    const a = this.viewVec(dir3);
    const dx = a[0] * scale, dy = -a[1] * scale;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  },

  // ==================== 渲染 ====================
  curScale() {
    return this.boardSize / (this.n * 1.5);
  },

  // 视图变换：先绕 Y(yaw) 再绕 X(pitch)，正交投影
  viewVec(v) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const x1 = v[0] * cy + v[2] * sy;
    const z1 = -v[0] * sy + v[2] * cy;
    const y2 = v[1] * cp - z1 * sp;
    const z2 = v[1] * sp + z1 * cp;
    return [x1, y2, z2];
  },

  tick() {
    const t = now();
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    const ctx = this.ctx;
    if (!ctx) return;

    // 菜单展示魔方缓慢自转
    if (this.demoMode) this.yaw += dt * 0.3;

    // 层转动动画推进
    if (this.anim) {
      this.anim.t += dt;
      if (this.anim.t >= this.anim.dur) {
        const a = this.anim;
        this.anim = null;
        this.rotateSlice(a.axis, a.layer, a.dir);
        if (this.state === 'playing') {
          this.moves++;
          this.setData({ moves: this.moves });
          if (this.isSolved()) this.onWin();
        }
      }
    }

    // 计时（每秒 setData 一次）
    if (this.state === 'playing') {
      const sec = Math.floor((now() - this.timeStart) / 1000);
      if (sec !== this.lastSec) {
        this.lastSec = sec;
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        this.setData({ timeStr: mm + ':' + ss });
      }
    }

    // 背景
    const g = ctx.createLinearGradient(0, 0, 0, this.vh);
    g.addColorStop(0, '#0b1026'); g.addColorStop(0.6, '#172554'); g.addColorStop(1, '#0f172a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, this.vh);

    this.drawCube(ctx);
    this.drawParticles(ctx, dt);
  },

  drawCube(ctx) {
    if (!this.faces) return;
    const N = this.n;
    const scale = this.curScale();
    const cx = this.vw / 2;
    const cy = this.boardY + this.boardSize / 2;
    const animK = this.anim ? -(N - 1) + 2 * this.anim.layer : 0;
    const animAng = this.anim
      ? easeInOut(Math.min(1, this.anim.t / this.anim.dur)) * Math.PI / 2 * this.anim.dir
      : 0;

    // 地面软阴影
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + scale * N * 0.72, scale * N * 0.62, scale * N * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    const quads = [];
    const half = 0.42;   // 贴纸半边长（留缝隙）
    FACES.forEach((f, fi) => {
      const n = [0, 0, 0]; n[f.axis] = f.sign;
      const right = cross(f.up, n);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const { p } = this.stickerPos(fi, r, c);
          const center = [p[0] / 2 + n[0] * 0.505, p[1] / 2 + n[1] * 0.505, p[2] / 2 + n[2] * 0.505];
          let corners = [
            vAdd(center, vAdd(vScale(f.up, -half), vScale(right, -half))),
            vAdd(center, vAdd(vScale(f.up, half), vScale(right, -half))),
            vAdd(center, vAdd(vScale(f.up, half), vScale(right, half))),
            vAdd(center, vAdd(vScale(f.up, -half), vScale(right, half)))
          ];
          let cn = n;
          // 转动中的层：连续旋转动画
          if (this.anim && p[this.anim.axis] === animK) {
            corners = corners.map(v => rotVecAngle(v, this.anim.axis, animAng));
            cn = rotVecAngle(n, this.anim.axis, animAng);
          }
          const vn = this.viewVec(cn);
          if (vn[2] <= 0.01) continue;   // 背面剔除
          const pts = corners.map(v => {
            const vv = this.viewVec(v);
            return { x: cx + vv[0] * scale, y: cy - vv[1] * scale, z: vv[2] };
          });
          quads.push({
            pts,
            depth: (pts[0].z + pts[1].z + pts[2].z + pts[3].z) / 4,
            color: COLORS[this.faces[fi][r * N + c]],
            vn,
            p, n, up: f.up, right
          });
        }
      }
    });

    quads.sort((a, b) => a.depth - b.depth);   // 画家算法：远→近
    this.hitQuads = quads;

    quads.forEach(q => {
      const bright = 0.72 + 0.28 * Math.max(0, dot(q.vn, LIGHT));
      ctx.beginPath();
      ctx.moveTo(q.pts[0].x, q.pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(q.pts[i].x, q.pts[i].y);
      ctx.closePath();
      ctx.fillStyle = shadeColor(q.color, bright);
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,12,25,.6)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
  },

  drawParticles(ctx, dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.vy += 380 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
});
