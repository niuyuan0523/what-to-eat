// 方块跳跳消：按压蓄力跳跃 × 堆叠消除
// 由 H5 版本移植：Canvas 渲染部分保留在 2d canvas 中，HUD/遮罩层改为 WXML + setData 驱动

const ICONS = ['🍄', '⭐', '💧', '🍀'];          // 图案种类（少而精，提升配对率）
const TRAY_MAX = 7;                              // 收集槽容量
// 难度配置：heightVar=平台高度随机偏移幅度，moveAmp=升降振幅，moveSpd=升降角速度范围
const DIFF = {
  easy:   { label: '初级', heightVar: 0,   moveAmp: 0,  moveSpd: [0, 0] },
  medium: { label: '中级', heightVar: 110, moveAmp: 0,  moveSpd: [0, 0] },
  hard:   { label: '高级', heightVar: 70,  moveAmp: 46, moveSpd: [1.1, 2.2] }
};

const BEST_KEY = 'blockJumpBest';

// ==================== 工具函数 ====================
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const now = () => Date.now();

Page({
  data: {
    phase: 'start',            // start | playing | over：控制遮罩层显示
    score: 0,
    best: 0,
    diffLabel: '初级',
    comboText: '',
    comboShow: false,
    powerShow: false,
    powerPct: 0,
    traySlots: [],             // [{ icon, filled, clearing }]
    overReason: '',
    overScore: 0,
    overBest: '',
    statusBarHeight: 20       // 状态栏高度（px），HUD 需避开系统时间/信号区域
  },

  onLoad() {
    // 自定义导航栏下 env(safe-area-inset-top) 部分机型取不到值，改用接口实测状态栏高度
    const winInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusBarHeight: winInfo.statusBarHeight || 20 });

    this.difficulty = 'easy';
    this.state = 'idle';       // idle | ready | charging | jumping | falling | over-wait | over
    this.best = +(wx.getStorageSync(BEST_KEY) || 0);
    this.score = 0;
    this.matchCombo = 0;
    this.tray = [];
    this.platforms = [];
    this.current = null;
    this.candidates = [];
    this.camX = 0; this.camTarget = 0;
    this.particles = []; this.popups = [];
    this.clouds = [];
    this.power = 0; this.chargeStart = 0;
    this.shake = 0;
    this.player = { x: 0, y: 0, size: 34, rot: 0, squash: 1 };
    this.jump = null;
    this.fall = null;
    this.destroyed = false;
    this.comboTimer = null;
    this.actx = null;

    this.setData({ best: this.best, traySlots: this.buildTraySlots() });
    this.initCanvas();
  },

  onUnload() {
    this.destroyed = true;
    if (this.comboTimer) clearTimeout(this.comboTimer);
    if (this.rafId && this.canvas) this.canvas.cancelAnimationFrame(this.rafId);
    if (this.actx && this.actx.close) { try { this.actx.close(); } catch (e) { /* 忽略 */ } }
  },

  // ==================== Canvas 初始化 ====================
  initCanvas() {
    wx.createSelectorQuery()
      .select('#game')
      .fields({ node: true, size: true })
      .exec(res => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = Math.min(info.pixelRatio || 1, 2);
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.dpr = dpr;
        this.vw = res[0].width;
        this.vh = res[0].height;
        canvas.width = this.vw * dpr;
        canvas.height = this.vh * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.S = Math.max(0.68, Math.min(1, this.vw / 520)); // 小屏整体缩短跳跃距离
        this.groundY = this.vh * 0.66;

        this.lastT = now();
        const loop = () => {
          if (this.destroyed) return;
          this.tick();
          this.rafId = canvas.requestAnimationFrame(loop);
        };
        this.rafId = canvas.requestAnimationFrame(loop);
      });
  },

  // ==================== 音效（WebAudio 轻量合成） ====================
  beep(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
    if (this.destroyed) return;   // 页面销毁后残留定时器不再触发音频，避免重建已关闭的上下文
    try {
      if (!this.actx) this.actx = wx.createWebAudioContext();
      const actx = this.actx;
      if (actx.state === 'suspended' && actx.resume) actx.resume();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.linearRampToValueAtTime(freq + slide, actx.currentTime + dur);
      g.gain.setValueAtTime(vol, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* 忽略音频错误 */ }
  },
  sfxJump()  { this.beep(300, .25, 'sine', .18, 260); },
  sfxLand()  { this.beep(200, .12, 'triangle', .2); },
  sfxMatch() { this.beep(660, .12, 'sine', .18); setTimeout(() => this.beep(880, .16, 'sine', .18), 90); },
  sfxClear() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, .14, 'sine', .16), i * 80)); },
  sfxOver()  { this.beep(220, .3, 'sawtooth', .12, -120); setTimeout(() => this.beep(150, .5, 'sawtooth', .12, -80), 200); },
  sfxFall()  { this.beep(1000, .65, 'sine', .2, -700); setTimeout(() => this.beep(600, .35, 'triangle', .14, -350), 180); },
  sfxPerfect() { this.beep(1200, .15, 'sine', .2, 200); },

  // ==================== 平台生成 ====================
  // fixed=true 时生成固定高度的起始平台
  makePlatform(x, icon, fixed) {
    const d = DIFF[this.difficulty];
    let baseY = this.groundY;
    if (!fixed && d.heightVar > 0) {
      // 向上偏移多、向下偏移少，避免压到底部收集槽
      baseY = this.groundY + rand(-d.heightVar, d.heightVar * 0.45) * this.S;
    }
    const p = {
      x, w: rand(66, 94) * this.S, icon, alpha: 1, sparkle: 0, bounce: 0,
      baseY, y: baseY, amp: 0, phase: rand(0, Math.PI * 2), spd: 0
    };
    if (!fixed && d.moveAmp > 0) {
      p.amp = rand(d.moveAmp * 0.5, d.moveAmp) * this.S;
      p.spd = rand(d.moveSpd[0], d.moveSpd[1]);
    }
    return p;
  },

  // 在当前平台前方生成两个候选（近 / 远），保证不重叠
  spawnCandidates() {
    const S = this.S;
    const w1 = rand(66, 94) * S, w2 = rand(66, 94) * S;
    const d1 = rand(125, 195) * S;
    const gap = (w1 + w2) / 2 + 26 * S;
    const d2 = d1 + gap + rand(10, 70) * S;

    let i1 = pick(ICONS), i2 = pick(ICONS);
    // 若两个都不匹配当前图案，有一定概率强制一个匹配，保证可玩性
    // （current.icon 可能是已消除的 '✨'，不在 ICONS 内时跳过，避免复制出可白嫖连击的空白平台）
    if (this.current && ICONS.indexOf(this.current.icon) !== -1 &&
        i1 !== this.current.icon && i2 !== this.current.icon && Math.random() < 0.4) {
      if (Math.random() < 0.5) i1 = this.current.icon; else i2 = this.current.icon;
    }
    const p1 = this.makePlatform(this.current.x + d1, i1); p1.w = w1;
    const p2 = this.makePlatform(this.current.x + d2, i2); p2.w = w2;
    this.candidates = [p1, p2];
    this.platforms.push(p1, p2);
  },

  initClouds() {
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      this.clouds.push({
        x: rand(0, this.vw * 2), y: rand(20, this.vh * 0.4),
        r: rand(18, 46), spd: rand(4, 12), depth: rand(0.15, 0.45)
      });
    }
  },

  // ==================== 游戏流程 ====================
  reset() {
    this.score = 0; this.matchCombo = 0; this.tray = [];
    this.platforms = []; this.particles = []; this.popups = [];
    this.camX = 0; this.camTarget = 0; this.shake = 0;
    this.jump = null; this.fall = null;

    this.current = this.makePlatform(60 * this.S + 40, pick(ICONS), true);
    this.platforms.push(this.current);
    this.player.x = this.current.x; this.player.y = this.current.y;
    this.player.rot = 0; this.player.squash = 1;
    this.spawnCandidates();
    this.camTarget = this.current.x - this.vw * 0.26; this.camX = this.camTarget;
    this.initClouds();
    this.setData({
      phase: 'playing',
      score: 0,
      best: this.best,
      diffLabel: DIFF[this.difficulty].label,
      traySlots: this.buildTraySlots(),
      comboShow: false,
      powerShow: false,
      powerPct: 0
    });
    this.state = 'ready';
  },

  addScore(n, x, y, text, color) {
    this.score += n;
    this.setData({ score: this.score });
    this.popups.push({ x, y, text: text || ('+' + n), color: color || '#fff', life: 1 });
  },

  showCombo(n) {
    if (n < 2) return;
    this.setData({ comboText: '🔥 连消 x' + n, comboShow: true });
    if (this.comboTimer) clearTimeout(this.comboTimer);
    this.comboTimer = setTimeout(() => {
      if (!this.destroyed) this.setData({ comboShow: false });
    }, 1400);
  },

  // ==================== 收集槽 ====================
  buildTraySlots(clearingIcon) {
    const slots = [];
    for (let i = 0; i < TRAY_MAX; i++) {
      const icon = this.tray && this.tray[i] ? this.tray[i] : '';
      slots.push({
        icon,
        filled: !!icon,
        clearing: !!(clearingIcon && icon === clearingIcon)
      });
    }
    return slots;
  },

  // 落到不同图案平台：图案入槽，凑 3 消除
  pushTray(icon, px, py) {
    this.tray.push(icon);
    const count = this.tray.filter(t => t === icon).length;
    if (count >= 3) {
      this.setData({ traySlots: this.buildTraySlots(icon) });
      this.sfxClear();
      this.spawnParticles(px, py - 30, '#fbbf24', 26);
      setTimeout(() => {
        if (this.destroyed) return;
        let removed = 0;
        this.tray = this.tray.filter(t => !(t === icon && removed++ < 3));
        this.setData({ traySlots: this.buildTraySlots() });
      }, 380);
      this.addScore(50, px, py - 70, '三连清除 +50', '#fbbf24');
      return true;
    }
    this.setData({ traySlots: this.buildTraySlots() });
    if (this.tray.length >= TRAY_MAX) {
      setTimeout(() => this.gameOver('📥 收集槽满了！'), 450);
      return false;
    }
    return true;
  },

  // ==================== 跳跃逻辑 ====================
  startCharge() {
    if (this.state !== 'ready') return;
    this.state = 'charging';
    this.chargeStart = now();
    this.power = 0;
    this.setData({ powerShow: true, powerPct: 0 });
  },

  releaseJump() {
    if (this.state !== 'charging') return;
    this.setData({ powerShow: false });
    this.state = 'jumping';
    this.sfxJump();

    const S = this.S;
    const maxD = 400 * S, minD = 60 * S;
    const dist = minD + this.power * (maxD - minD);
    const x0 = this.player.x, x1 = this.player.x + dist;
    const dur = 380 + dist * 0.55;
    const h = 70 * S + dist * 0.3;
    // 落点在松手瞬间即确定，可预先锁定目标平台（供飞行轨迹跟踪其高度）
    let target = null;
    for (const p of this.candidates) {
      if (x1 >= p.x - p.w / 2 && x1 <= p.x + p.w / 2) { target = p; break; }
    }
    if (!target && x1 >= this.current.x - this.current.w / 2 && x1 <= this.current.x + this.current.w / 2) {
      target = this.current;
    }
    this.jump = { x0, x1, y0: this.player.y, h, t0: now(), dur, target };
  },

  finishJump(landX) {
    // 判定落点平台
    const from = this.current;
    let landed = null;
    for (const p of this.candidates) {
      if (landX >= p.x - p.w / 2 && landX <= p.x + p.w / 2) { landed = p; break; }
    }
    // 跳回原平台也算安全
    if (!landed && landX >= from.x - from.w / 2 && landX <= from.x + from.w / 2) {
      this.player.x = landX; this.player.y = from.y;
      this.state = 'ready'; this.sfxLand();
      return;
    }
    if (!landed) { this.startFall(landX); return; }

    const landY = landed.y;
    this.player.x = landX; this.player.y = landY;
    landed.bounce = 1;
    this.sfxLand();
    this.shake = 4;

    // 另一个候选淡出
    for (const p of this.candidates) if (p !== landed) p.alpha = 0.99;

    // 基础分 + 完美落点
    let base = 1;
    const isPerfect = Math.abs(landX - landed.x) < 9 * this.S;
    if (isPerfect) {
      base += 2;
      this.sfxPerfect();
      this.addScore(base, landX, landY - 90, '完美 +' + base, '#22d3ee');
      this.spawnParticles(landX, landY, '#22d3ee', 14);
    } else {
      this.addScore(base, landX, landY - 90);
    }

    let trayOk = true;
    if (landed.icon === from.icon) {
      // ★ 同图案直接消除
      this.matchCombo++;
      const bonus = 20 * this.matchCombo;
      this.addScore(bonus, landX, landY - 120, '同图消除 +' + bonus, '#f472b6');
      this.showCombo(this.matchCombo);
      this.sfxMatch();
      this.spawnParticles(landX, landY - 20, '#f472b6', 22);
      landed.sparkle = 1;
      landed.icon = '✨';                       // 被消除的平台变为空白闪光台
    } else {
      this.matchCombo = 0;
      trayOk = this.pushTray(landed.icon, landX, landY);
    }

    // 旧平台标记淡出，推进相机
    from.alpha = 0.99;
    this.current = landed;
    this.candidates = [];
    // trayOk=false 表示槽已满且无法消除（gameOver 已排定），此时不再生成候选；
    // 注意不能按 tray.length 判定：三连消瞬间长度可能临时为 7，380ms 后才移除
    if (trayOk) this.spawnCandidates();
    this.camTarget = this.current.x - this.vw * 0.26;

    this.state = trayOk ? 'ready' : 'over-wait';
  },

  startFall(landX) {
    this.state = 'falling';
    this.fall = { x: landX, y: this.player.y, vy: 0, t0: now() };
    this.sfxFall();                                          // 下坠哨音
    setTimeout(() => { this.sfxOver(); this.gameOver('💥 坠落了！'); }, 750);
  },

  gameOver(reason) {
    if (this.state === 'over' || this.destroyed) return;
    this.state = 'over';
    if (this.score > this.best) {
      this.best = this.score;
      wx.setStorageSync(BEST_KEY, this.best);
    }
    this.setData({
      phase: 'over',
      overReason: reason,
      overScore: this.score,
      overBest: '最佳 ' + this.best,
      best: this.best,
      powerShow: false
    });
  },

  // ==================== 粒子 / 飘字 ====================
  spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(60, 260);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: 1, color, r: rand(2, 5) });
    }
  },

  // ==================== 渲染 ====================
  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  drawBackground(dt) {
    const { ctx, vw, vh } = this;
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#312e81'); g.addColorStop(0.5, '#6d28d9'); g.addColorStop(1, '#db2777');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    // 云朵（视差）
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    for (const c of this.clouds) {
      c.x -= c.spd * dt;
      const sx = ((c.x - this.camX * c.depth) % (vw + 200) + vw + 200) % (vw + 200) - 100;
      ctx.beginPath();
      ctx.arc(sx, c.y, c.r, 0, Math.PI * 2);
      ctx.arc(sx + c.r * 0.9, c.y + 4, c.r * 0.7, 0, Math.PI * 2);
      ctx.arc(sx - c.r * 0.8, c.y + 6, c.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 地面远景
    ctx.fillStyle = 'rgba(15,23,42,.35)';
    ctx.fillRect(0, this.groundY + 46, vw, vh - this.groundY - 46);
  },

  drawPlatform(p) {
    const { ctx, vh } = this;
    const x = p.x - this.camX, topY = p.y;
    const h = 46, depth = 12;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    const b = p.bounce > 0 ? Math.sin(p.bounce * Math.PI) * 5 : 0;

    // 柱身
    ctx.fillStyle = 'rgba(15,23,42,.55)';
    this.roundRect(x - p.w / 2 + 4, topY + b + depth, p.w - 8, vh - topY, 6);
    ctx.fill();
    // 顶面
    const grad = ctx.createLinearGradient(x, topY + b, x, topY + b + h);
    grad.addColorStop(0, '#f8fafc'); grad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = grad;
    this.roundRect(x - p.w / 2, topY + b, p.w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,23,42,.25)'; ctx.lineWidth = 2;
    ctx.stroke();

    // 图案
    if (p.icon) {
      ctx.font = `${26 * this.S + 4}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.icon, x, topY + b + h / 2 + 2);
    }
    // 完美落点中心标记
    ctx.fillStyle = 'rgba(99,102,241,.5)';
    ctx.beginPath(); ctx.arc(x, topY + b + 6, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (p.bounce > 0) p.bounce = Math.max(0, p.bounce - 0.08);
  },

  drawPlayer() {
    const { ctx, player, current } = this;
    let px = player.x, py = player.y, rot = 0, squash = 1;

    if (this.state === 'ready' || this.state === 'charging') {
      // 站立时跟随所在平台高度（高级难度平台会升降）
      if (current) { py = current.y; player.y = py; }
      if (this.state === 'charging') squash = 1 - this.power * 0.32;   // 蓄力下蹲
    } else if (this.state === 'jumping' && this.jump) {
      const jump = this.jump;
      const t = Math.min(1, (now() - jump.t0) / jump.dur);
      // 终点高度实时跟踪目标平台（升降平台在飞行中仍会移动）
      const yEnd = jump.target ? jump.target.y : Math.max(jump.y0, this.groundY);
      px = lerp(jump.x0, jump.x1, t);
      py = lerp(jump.y0, yEnd, t) - jump.h * 4 * t * (1 - t);
      rot = t * Math.PI * 2;
      player.x = px; player.y = py;
      if (t >= 1) { this.jump = null; this.finishJump(px); }
    } else if (this.state === 'falling' && this.fall) {
      const fall = this.fall;
      fall.vy += 22;
      fall.y += fall.vy * 0.016;
      px = fall.x; py = fall.y; rot = (now() - fall.t0) / 130;
    }

    const s = player.size * this.S + 6;
    const sh = s * squash, sw = s * (2 - squash);
    ctx.save();
    // 影子（投在目标/所在平台顶面上）
    const surfY = (this.state === 'jumping' && this.jump)
      ? (this.jump.target ? this.jump.target.y : this.groundY)
      : (current ? current.y : this.groundY);
    if (py <= surfY + 4) {
      const airRatio = Math.max(0, 1 - (surfY - py) / 200);
      ctx.fillStyle = `rgba(0,0,0,${0.25 * airRatio})`;
      ctx.beginPath();
      ctx.ellipse(px - this.camX, surfY + 4, sw * 0.55 * airRatio + 6, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.translate(px - this.camX, py - sh / 2);
    ctx.rotate(rot);
    const g = ctx.createLinearGradient(-sw / 2, -sh / 2, sw / 2, sh / 2);
    g.addColorStop(0, '#38bdf8'); g.addColorStop(1, '#6366f1');
    ctx.fillStyle = g;
    this.roundRect(-sw / 2, -sh / 2, sw, sh, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke();
    // 表情
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(-sw * 0.18, -sh * 0.1, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sw * 0.18, -sh * 0.1, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, sh * 0.08, 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.restore();
  },

  drawFx(dt) {
    const ctx = this.ctx;
    // 粒子
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) {
      p.life -= dt * 1.6;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 380 * dt;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x - this.camX, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 飘字
    this.popups = this.popups.filter(p => p.life > 0);
    for (const p of this.popups) {
      p.life -= dt * 0.9;
      p.y -= 46 * dt;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.font = '800 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x - this.camX, p.y);
    }
    ctx.globalAlpha = 1;
  },

  // ==================== 主循环 ====================
  tick() {
    const t = now();
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;

    // 蓄力进度（setData 有开销，进度变化超过 2% 才刷新）
    if (this.state === 'charging') {
      this.power = Math.min(1, (t - this.chargeStart) / 1300);
      const pct = Math.round(this.power * 100);
      if (Math.abs(pct - this.data.powerPct) >= 2 || pct >= 100) {
        this.setData({ powerPct: pct });
      }
    }
    // 相机平滑跟随 + 震屏
    this.camX = lerp(this.camX, this.camTarget, 0.08);
    if (this.shake > 0) { this.camX += rand(-this.shake, this.shake); this.shake -= dt * 22; }

    // 淡出旧平台 + 高级难度平台升降
    this.platforms = this.platforms.filter(p => p.alpha > 0.02);
    const nowSec = t / 1000;
    for (const p of this.platforms) {
      if (p.amp > 0) p.y = p.baseY + Math.sin(nowSec * p.spd + p.phase) * p.amp;
      if (p.alpha < 1 && p !== this.current) p.alpha -= dt * 1.2;
      if (p.sparkle > 0) p.sparkle -= dt;
    }

    this.drawBackground(dt);
    for (const p of this.platforms) this.drawPlatform(p);
    if (this.state !== 'idle') this.drawPlayer();
    this.drawFx(dt);
  },

  // ==================== 输入（触摸） ====================
  onPress() {
    this.startCharge();
  },
  onRelease() {
    this.releaseJump();
  },
  // 空处理器：供 catchtouchstart/catchtouchend 阻断按钮上的触摸冒泡
  noop() {},

  // 难度选择即开局
  onSelectDiff(e) {
    this.difficulty = e.currentTarget.dataset.diff || 'easy';
    this.reset();
  },
  onRetry() {
    this.reset();
  },
  onBackMenu() {
    this.state = 'idle';
    this.setData({ phase: 'start' });
  },
  onBackHome() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    });
  }
});
