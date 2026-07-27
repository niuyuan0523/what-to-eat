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
const SFX_GAIN = 1.7;                            // 音效主音量系数（统一提响）

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
  // 获取（或创建）音频上下文
  getAudioCtx() {
    if (!this.actx) this.actx = wx.createWebAudioContext();
    if (this.actx.state === 'suspended' && this.actx.resume) this.actx.resume();
    return this.actx;
  },

  beep(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
    if (this.destroyed) return;   // 页面销毁后残留定时器不再触发音频，避免重建已关闭的上下文
    try {
      const actx = this.getAudioCtx();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.linearRampToValueAtTime(freq + slide, actx.currentTime + dur);
      g.gain.setValueAtTime(Math.min(0.55, vol * SFX_GAIN), actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* 忽略音频错误 */ }
  },
  // 起跳/落地音高带随机浮动，避免每次一模一样
  sfxJump()  { this.beep(rand(280, 330), .25, 'sine', .18, 260); },
  sfxLand()  { this.beep(rand(180, 230), .12, 'triangle', .2); },
  // 同图消除：连击越高音调越高，层层递进更带感（封顶防刺耳）
  sfxMatch(combo) {
    const k = Math.min(combo || 1, 6) - 1;
    const base = 660 * Math.pow(1.12, k);
    this.beep(base, .12, 'sine', .18);
    setTimeout(() => this.beep(base * 4 / 3, .16, 'sine', .18), 90);
  },
  sfxClear() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, .14, 'sine', .16), i * 80)); },
  sfxOver()  { this.beep(220, .3, 'sawtooth', .14, -120); setTimeout(() => this.beep(150, .5, 'sawtooth', .14, -80), 200); },
  // 坠落尖叫"啊——"：离线合成 PCM 波形后播放（不依赖滤波器/参数调制节点，微信 WebAudio 兼容性最好）
  buildScreamBuffer(actx) {
    const sr = actx.sampleRate, dur = 1.0, len = Math.floor(sr * dur);
    const buf = actx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let ph1 = 0, ph2 = 0;
    // 手写带通滤波（"啊"元音共振峰）状态与系数
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    let b0 = 0, b2 = 0, a1c = 0, a2c = 0;
    const setBP = (fc) => {
      const w = 2 * Math.PI * fc / sr;
      const alpha = Math.sin(w) / 2.2, cw = Math.cos(w);   // Q ≈ 1.1
      const a0 = 1 + alpha;
      b0 = alpha / a0; b2 = -alpha / a0;
      a1c = -2 * cw / a0; a2c = (1 - alpha) / a0;
    };
    for (let i = 0; i < len; i++) {
      const t = i / sr, p = t / dur;
      // 音高包络：倒吸一口气式冲高，再一路下坠
      let f = t < 0.09
        ? 620 + 260 * (t / 0.09)
        : 880 * Math.pow(160 / 880, (t - 0.09) / (dur - 0.09));
      // 颤音：越掉越慌，抖动逐渐加快
      f += Math.sin(2 * Math.PI * (9 + 8 * p) * t) * 50;
      ph1 += f / sr; ph2 += (f * 1.012) / sr;
      // 双失谐锯齿波
      const s = (ph1 % 1) * 2 - 1 + ((ph2 % 1) * 2 - 1) * 0.7;
      // 共振峰下扫（1000→480Hz，每 128 样本更新一次系数）
      if ((i & 127) === 0) setBP(1000 * Math.pow(0.48, p));
      const out = b0 * s + b2 * x2 - a1c * y1 - a2c * y2;
      x2 = x1; x1 = s; y2 = y1; y1 = out;
      // 音量包络：快速起声 → 喊住不放 → 越掉越远越小声
      const env = Math.min(1, t / 0.05) * (p < 0.55 ? 1 : Math.pow(1 - (p - 0.55) / 0.45, 1.5));
      d[i] = Math.tanh(out * 6) * env;   // 软削波增加嘶喊质感
    }
    return buf;
  },
  sfxFall() {
    if (this.destroyed) return;
    try {
      const actx = this.getAudioCtx();
      if (!this.screamBuf) this.screamBuf = this.buildScreamBuffer(actx);   // 合成一次后缓存
      const src = actx.createBufferSource();
      src.buffer = this.screamBuf;
      const g = actx.createGain();
      g.gain.value = 0.55;
      src.connect(g); g.connect(actx.destination);
      src.start(actx.currentTime);
    } catch (e) {
      // 兜底：合成失败时退回简单下滑惨叫音
      this.beep(900, .8, 'sawtooth', .3, -650);
    }
  },
  // 同图消除欢呼：随机三选一，避免单调
  sfxCheer() {
    if (this.destroyed) return;
    const n = Math.floor(Math.random() * 3);
    if (n === 0) this.cheerWhoop();
    else if (n === 1) this.cheerFanfare();
    else this.cheerCrowd();
  },
  // "呜—呼!" 上扬欢呼
  cheerWhoop() {
    this.beep(500, .16, 'sine', .3, 420);
    setTimeout(() => this.beep(700, .22, 'sine', .32, 500), 140);
  },
  // 小号式凯旋琶音
  cheerFanfare() {
    [659, 784, 988, 1319].forEach((f, i) =>
      setTimeout(() => this.beep(f, i === 3 ? .3 : .12, 'square', .14), i * 90));
  },
  // 人群"哗——"欢呼（带通滤噪声浪涌，噪声缓冲懒创建一次后复用）
  cheerCrowd() {
    if (this.destroyed) return;
    try {
      const actx = this.getAudioCtx();
      const t0 = actx.currentTime, dur = 0.7;
      if (!this.noiseBuf) {
        const len = Math.floor(actx.sampleRate * 0.8);
        this.noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = actx.createBufferSource(); src.buffer = this.noiseBuf;
      const bp = actx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.6;
      const g = actx.createGain();
      g.gain.setValueAtTime(0.001, t0);
      g.gain.exponentialRampToValueAtTime(0.42, t0 + 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(bp); bp.connect(g); g.connect(actx.destination);
      src.start(t0); src.stop(t0 + dur);
    } catch (e) { /* 忽略音频错误 */ }
  },
  sfxPerfect() { this.beep(1200, .15, 'sine', .2, 200); },
  // 蓄力滴答：随力度升调，节奏感提示当前蓄力程度
  sfxChargeTick(power) { this.beep(260 + power * 520, .05, 'square', .05); },
  // 蓄满提示：两声高频短鸣，提醒力度已达上限
  sfxPowerMax() { this.beep(1320, .08, 'square', .12); setTimeout(() => this.beep(1760, .12, 'square', .12), 90); },
  // 图案入槽"啵"：同图案越多音调越高（离三连越近越兴奋）
  sfxPop(count) { this.beep(420 + count * 160, .1, 'triangle', .2, 80); },
  // 收集槽将满警告：两声急促低鸣
  sfxWarn() { this.beep(320, .1, 'square', .14); setTimeout(() => this.beep(320, .14, 'square', .14), 150); },
  // UI 按钮点击：轻快短促
  sfxClick() { this.beep(600, .07, 'triangle', .12, 120); },
  // 待机挥手口哨："呼—嘘"两音，俏皮打招呼
  sfxWhistle() { this.beep(880, .12, 'sine', .08, 220); setTimeout(() => this.beep(1180, .16, 'sine', .08, -160), 150); },
  // 破纪录喝彩：上行琶音收尾拉长
  sfxRecord() {
    [784, 988, 1175, 1568].forEach((f, i) =>
      setTimeout(() => this.beep(f, i === 3 ? .35 : .12, 'sine', .18), i * 100));
  },

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

  // 在当前平台前方补足两个候选；keep 为落地后仍位于前方、需保留的旧候选
  // （保留柱的位置与图案不变，保证落点柱子的连续感）
  spawnCandidates(keep) {
    const S = this.S;
    const list = (keep || []).slice().sort((a, b) => a.x - b.x);
    const fresh = [];
    let anchor = list.length ? list[list.length - 1] : this.current;

    while (list.length < 2) {
      const w = rand(66, 94) * S;
      // 中心距：不小于两柱半宽+间隙，分布与首跳距离一致，保证手感统一
      const d = Math.max((anchor.w + w) / 2 + 26 * S, rand(125, 195) * S);
      const p = this.makePlatform(anchor.x + d, pick(ICONS));
      p.w = w;
      list.push(p);
      fresh.push(p);
      anchor = p;
    }

    // 若所有候选都不匹配当前图案，有一定概率让一个新生成的柱子匹配，保证可玩性
    // （current.icon 可能是已消除的 '✨'，不在 ICONS 内时跳过；保留柱的图案绝不改动）
    if (this.current && ICONS.indexOf(this.current.icon) !== -1 && fresh.length &&
        list.every(p => p.icon !== this.current.icon) && Math.random() < 0.4) {
      pick(fresh).icon = this.current.icon;
    }

    this.candidates = list;
    this.platforms.push(...fresh);
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
    if (count < 3) this.sfxPop(count);   // 入槽"啵"声，越接近三连音调越高
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
      setTimeout(() => { this.sfxOver(); this.gameOver('📥 收集槽满了！'); }, 450);
      return false;
    }
    if (this.tray.length === TRAY_MAX - 1) {
      setTimeout(() => this.sfxWarn(), 200);   // 只剩一格：警告音提醒
    }
    return true;
  },

  // ==================== 跳跃逻辑 ====================
  startCharge() {
    if (this.state !== 'ready') return;
    this.state = 'charging';
    this.chargeStart = now();
    this.power = 0;
    this.lastChargeTick = 0;       // 蓄力滴答计时
    this.powerMaxPlayed = false;   // 蓄满提示只响一次
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

    // 被跳过（身后）的候选淡出；仍在前方的候选保留，维持柱子序列的连续感
    const keptAhead = [];
    for (const p of this.candidates) {
      if (p === landed) continue;
      if (p.x > landed.x) keptAhead.push(p); else p.alpha = 0.99;
    }

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
      this.sfxMatch(this.matchCombo);
      setTimeout(() => this.sfxCheer(), 120);   // 随机欢呼声助兴
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
    if (trayOk) this.spawnCandidates(keptAhead);
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
      setTimeout(() => this.sfxRecord(), 600);   // 破纪录喝彩，错开结束音
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
    let px = player.x, py = player.y;
    let pose = 'stand', pt = 0;

    if (this.state === 'ready' || this.state === 'charging') {
      // 站立时跟随所在平台高度（高级难度平台会升降）
      if (current) { py = current.y; player.y = py; }
      if (this.state === 'charging') {
        pose = 'crouch'; pt = this.power;   // 蓄力下蹲后摆臂
        this.waveT0 = 0;                    // 蓄力打断挥手
      } else {
        // 待机时随机转身面向屏幕挥手致意，结束后恢复侧脸站立
        const tNow = now();
        if (!this.nextWaveAt) this.nextWaveAt = tNow + rand(2500, 6000);
        if (this.waveT0) {
          const el = tNow - this.waveT0;
          if (el < 1600) { pose = 'wave'; pt = el / 1600; }
          else { this.waveT0 = 0; this.nextWaveAt = tNow + rand(5000, 10000); }
        } else if (tNow >= this.nextWaveAt) {
          this.waveT0 = tNow;
          pose = 'wave'; pt = 0;
          this.sfxWhistle();   // 挥手时俏皮口哨打招呼
        }
      }
    } else if (this.state === 'jumping' && this.jump) {
      const jump = this.jump;
      const t = Math.min(1, (now() - jump.t0) / jump.dur);
      // 终点高度实时跟踪目标平台（升降平台在飞行中仍会移动）
      const yEnd = jump.target ? jump.target.y : Math.max(jump.y0, this.groundY);
      px = lerp(jump.x0, jump.x1, t);
      py = lerp(jump.y0, yEnd, t) - jump.h * 4 * t * (1 - t);
      player.x = px; player.y = py;
      pose = 'flight'; pt = t;
      if (t >= 1) { this.jump = null; this.finishJump(px); }
    } else if (this.state === 'falling' && this.fall) {
      const fall = this.fall;
      fall.vy += 22;
      fall.y += fall.vy * 0.016;
      px = fall.x; py = fall.y;
      pose = 'fall'; pt = (now() - fall.t0) / 1000;
    }

    const s = player.size * this.S + 6;
    ctx.save();
    // 影子（投在目标/所在平台顶面上）
    const surfY = (this.state === 'jumping' && this.jump)
      ? (this.jump.target ? this.jump.target.y : this.groundY)
      : (current ? current.y : this.groundY);
    if (py <= surfY + 4) {
      const airRatio = Math.max(0, 1 - (surfY - py) / 200);
      ctx.fillStyle = `rgba(0,0,0,${0.25 * airRatio})`;
      ctx.beginPath();
      ctx.ellipse(px - this.camX, surfY + 4, s * 0.55 * airRatio + 6, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    this.drawRunner(px - this.camX, py, s, pose, pt);
  },

  // 跳远小人：根据姿态参数绘制头/躯干/四肢（角度以竖直向下为 0，向前为正）
  drawRunner(x, y, s, pose, t) {
    if (pose === 'wave') { this.drawWaver(x, y, s, t); return; }   // 正脸挥手单独绘制
    const ctx = this.ctx;
    const H = s * 1.55;                       // 身高
    const r = s * 0.3;                        // 头半径
    const limb = Math.max(3, s * 0.13);       // 四肢粗细

    // 默认站姿（待机轻微摆动）
    let lean = 0, crouch = 0;
    let armF = 0.25, elbF = 0.1, armB = -0.25, elbB = -0.1;
    let hipF = 0.12, kneeF = -0.08, hipB = -0.12, kneeB = -0.08;

    if (pose === 'stand') {
      const w = Math.sin(now() / 420) * 0.06;
      armF = 0.22 + w; armB = -0.22 - w;
    } else if (pose === 'crouch') {
      // 蓄力：前倾屈膝，双臂后摆蓄势
      crouch = t;
      lean = 0.5 * t;
      armF = -1.5 * t; elbF = -0.35 * t;
      armB = -1.3 * t; elbB = -0.35 * t;
      hipF = 0.95 * t; kneeF = -1.75 * t;
      hipB = 0.75 * t; kneeB = -1.65 * t;
    } else if (pose === 'flight') {
      // 起跳展体 → 空中收腹 → 伸腿落地（经典跳远动作）
      const u = Math.max(0, Math.min(1, (t - 0.3) / 0.45));
      lean = lerp(-0.18, 0.32, u);
      armF = lerp(2.7, 0.9, u);  elbF = lerp(0.4, 0.25, u);
      armB = lerp(2.2, 1.15, u); elbB = lerp(0.5, 0.25, u);
      hipF = lerp(1.35, 1.2, u); kneeF = lerp(-1.7, -0.3, u);
      hipB = lerp(-0.9, 1.0, u); kneeB = lerp(0.45, -0.45, u);
    } else if (pose === 'fall') {
      // 坠落：惊慌挥舞四肢
      lean = Math.sin(t * 9) * 0.4;
      armF = 2.9 + Math.sin(t * 13) * 0.45;
      armB = 2.5 - Math.sin(t * 13) * 0.45;
      hipF = 0.7 + Math.sin(t * 11) * 0.4;  kneeF = -0.9;
      hipB = -0.5 - Math.sin(t * 11) * 0.3; kneeB = -0.6;
    }

    // 骨骼长度
    const legU = H * 0.26, legL = H * 0.24;
    const torso = H * 0.34 * (1 - 0.18 * crouch);
    const armU = H * 0.22, armL = H * 0.18;
    // 髆部离地高度（下蹲时降低）
    const hipH = (legU + legL) * (1 - 0.4 * crouch);

    ctx.save();
    ctx.translate(x, y - hipH);
    ctx.rotate(lean);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 两段式肢体：从 (x0,y0) 出发，先转 a1 画 l1，再相对转 a2 画 l2
    const seg = (x0, y0, a1, l1, a2, l2, color, w) => {
      const x1 = x0 + Math.sin(a1) * l1, y1 = y0 + Math.cos(a1) * l1;
      const x2 = x1 + Math.sin(a1 + a2) * l2, y2 = y1 + Math.cos(a1 + a2) * l2;
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };

    // 远侧肢体（深色，在躯干后方）
    seg(0, -torso, armB, armU, elbB, armL, '#4338ca', limb);
    seg(0, 0, hipB, legU, kneeB, legL, '#4338ca', limb);

    // 躯干（保留原主题蓝色渐变）
    const g = ctx.createLinearGradient(0, -torso, 0, 0);
    g.addColorStop(0, '#38bdf8'); g.addColorStop(1, '#6366f1');
    ctx.strokeStyle = g; ctx.lineWidth = limb * 2.1;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -torso); ctx.stroke();

    // 近侧肢体（亮色）
    seg(0, 0, hipF, legU, kneeF, legL, '#6366f1', limb);
    seg(0, -torso, armF, armU, elbF, armL, '#38bdf8', limb);

    // 头部
    const headY = -torso - r * 1.05;
    ctx.fillStyle = '#ffd7a8';
    ctx.beginPath(); ctx.arc(0, headY, r, 0, Math.PI * 2); ctx.fill();
    // 运动发带
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = limb * 0.8;
    ctx.beginPath(); ctx.arc(0, headY, r, -Math.PI * 0.95, -Math.PI * 0.3); ctx.stroke();
    // 面向前方的眼睛与微笑
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(r * 0.42, headY - r * 0.12, limb * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(r * 0.3, headY + r * 0.3, r * 0.32, 0.1 * Math.PI, 0.7 * Math.PI); ctx.stroke();

    ctx.restore();
  },

  // 正脸挥手致意：面向屏幕站立，一只手举高摆动；t 为 0~1 的动作进度
  drawWaver(x, y, s, t) {
    const ctx = this.ctx;
    const H = s * 1.55, r = s * 0.3;
    const limb = Math.max(3, s * 0.13);
    const legU = H * 0.26, legL = H * 0.24;
    const torso = H * 0.34;
    const armU = H * 0.22, armL = H * 0.18;
    const hw = r * 0.55;                                          // 肩/髆半宽
    // 节奏：举起(前 15%) → 挥动 → 放下(后 15%)
    const lift = Math.min(1, Math.min(t, 1 - t) / 0.15);
    const swing = Math.sin(t * Math.PI * 7) * 0.5 * lift;         // 左右摆腕

    ctx.save();
    ctx.translate(x, y - legU - legL);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const seg = (x0, y0, a1, l1, a2, l2, color, w) => {
      const x1 = x0 + Math.sin(a1) * l1, y1 = y0 + Math.cos(a1) * l1;
      const x2 = x1 + Math.sin(a1 + a2) * l2, y2 = y1 + Math.cos(a1 + a2) * l2;
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };

    // 双腿正面站立，微微分开
    seg(-hw * 0.7, 0, -0.06, legU, 0, legL, '#4f46e5', limb);
    seg(hw * 0.7, 0, 0.06, legU, 0, legL, '#4f46e5', limb);

    // 躯干（正面略宽）
    const g = ctx.createLinearGradient(0, -torso, 0, 0);
    g.addColorStop(0, '#38bdf8'); g.addColorStop(1, '#6366f1');
    ctx.strokeStyle = g; ctx.lineWidth = limb * 2.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -torso); ctx.stroke();

    // 左臂自然下垂
    seg(-hw, -torso, -0.28, armU, -0.12, armL, '#38bdf8', limb);
    // 右臂从下垂平滑举起至高处挥动，结束时再放下
    const armA = lerp(0.25, 2.75, lift) + swing * 0.25;
    const elbA = lerp(0.1, 0.55, lift) + swing;
    seg(hw, -torso, armA, armU, elbA, armL, '#38bdf8', limb);

    // 头部（正脸）
    const headY = -torso - r * 1.05;
    ctx.fillStyle = '#ffd7a8';
    ctx.beginPath(); ctx.arc(0, headY, r, 0, Math.PI * 2); ctx.fill();
    // 发带
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = limb * 0.8;
    ctx.beginPath(); ctx.arc(0, headY, r, -Math.PI * 0.9, -Math.PI * 0.1); ctx.stroke();
    // 双眼 + 开心大微笑
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(-r * 0.35, headY - r * 0.12, limb * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.35, headY - r * 0.12, limb * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, headY + r * 0.22, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

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
      // 蓄力滴答：力度越大节奏越快、音调越高
      if (this.power < 1 && t - this.lastChargeTick >= 170 - this.power * 100) {
        this.lastChargeTick = t;
        this.sfxChargeTick(this.power);
      }
      if (this.power >= 1 && !this.powerMaxPlayed) {
        this.powerMaxPlayed = true;
        this.sfxPowerMax();
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
    this.sfxClick();
    this.difficulty = e.currentTarget.dataset.diff || 'easy';
    this.reset();
  },
  onRetry() {
    this.sfxClick();
    this.reset();
  },
  onBackMenu() {
    this.sfxClick();
    this.state = 'idle';
    this.setData({ phase: 'start' });
  },
  onBackHome() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    });
  }
});
