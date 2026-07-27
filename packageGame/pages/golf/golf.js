// 一杆进洞（差一丢丢）：滑动瞄准 × 按住蓄力 的极简高尔夫
// 物理手感 + 玄学运气：完美角度+完美力量必然一杆进洞，但窗口极小；
// 约 1% 概率触发"蝴蝶助攻"彩蛋；停在洞边触发慢动作回放"就差一丢丢"。

const SFX_GAIN = 1.6;                            // 音效主音量系数
const STATS_KEY = 'golfStats';
const SKIN_KEY = 'golfSkin';
const NICK_KEY = 'golfNick';
const DAILY_KEY = 'golfDaily';
const CLOUD_ENV = 'cloud1-d3g57caju929b77a5';    // 与 app.js 一致（独立分包直达时需自行初始化）

// 运气球助攻小动物
const HELPERS = [
  { icon: '🦋', name: '蝴蝶' },
  { icon: '🍃', name: '树叶' },
  { icon: '🐦', name: '小鸟' }
];

// 球场皮肤：视觉配色 + 物理差异（月球低重力 / 沙漠高摩擦）
const SKINS = {
  park:   { label: '清晨公园', icon: '🌳', sky: ['#7dd3fc', '#bae6fd', '#fef9c3'], far: '#86efac', ground: '#4ade80', groundDeep: '#16a34a', text: '#14532d', gMul: 1,    fricMul: 1 },
  neon:   { label: '深夜霓虹', icon: '🌃', sky: ['#0f172a', '#312e81', '#701a75'], far: '#4c1d95', ground: '#475569', groundDeep: '#1e293b', text: '#e2e8f0', gMul: 1,    fricMul: 0.9 },
  desert: { label: '沙漠戈壁', icon: '🏜️', sky: ['#fdba74', '#fed7aa', '#fef3c7'], far: '#f59e0b', ground: '#fcd34d', groundDeep: '#b45309', text: '#78350f', gMul: 1,    fricMul: 1.55 },
  moon:   { label: '月球表面', icon: '🌕', sky: ['#020617', '#0f172a', '#1e293b'], far: '#334155', ground: '#94a3b8', groundDeep: '#475569', text: '#f1f5f9', gMul: 0.5, fricMul: 0.62 }
};
const SKIN_KEYS = ['park', 'neon', 'desert', 'moon'];

// 排行榜维度
const BOARDS = [
  { key: 'total', label: '总积分' },
  { key: 'combo', label: '连击榜' },
  { key: 'luck',  label: '运气榜' },
  { key: 'rim',   label: '差一丢丢' },
  { key: 'daily', label: '每日一洞' }
];

// ==================== 工具函数 ====================
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => Date.now();
// 每日一洞：按日期字符串生成确定性随机序列（所有人同一配置）
function seededRng(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

Page({
  data: {
    phase: 'start',            // start | playing | daily-over
    mode: 'free',              // free | daily
    skin: 'park',
    skinList: SKIN_KEYS.map(k => ({ key: k, icon: SKINS[k].icon, label: SKINS[k].label })),
    score: 0,                  // 本次会话得分
    total: 0,                  // 历史总积分
    combo: 0,
    holeNo: 1,
    distLabel: '',
    angleDeg: 45,
    powerShow: false,
    powerPct: 0,
    bannerText: '',
    bannerSub: '',
    bannerShow: false,
    replayShow: false,
    strokeTip: '',             // 第 1 杆 / 第 2 杆提示
    overScore: 0,
    overBest: 0,
    overNew: false,
    // 排行榜
    rankShow: false,
    rankTab: 'total',
    boards: BOARDS,
    rankList: [],
    myRankText: '',
    rankLoading: false,
    rankErr: '',
    nick: '',
    statusBarHeight: 20,
    hudTop: 44                 // HUD 顶部基线（胶囊按钮下沿），onLoad 实测后更新
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

    // 独立分包可能不经过 app.js 直接进入，云能力需兜底初始化
    this.cloudOk = false;
    if (wx.cloud) {
      try { wx.cloud.init({ env: CLOUD_ENV, traceUser: true }); } catch (e) { /* 重复初始化忽略 */ }
      this.cloudOk = true;
    }

    this.destroyed = false;
    this.state = 'idle';       // idle | aim | charging | flight | rolling | replay | wait
    this.actx = null;
    this.bannerTimer = null;
    this.playToken = 0;        // 对局令牌：收杆/重开时 +1，用于作废旧对局的延时回调

    // 历史统计（本地持久化，云端排行榜同步同一份数据）
    const s = wx.getStorageSync(STATS_KEY) || {};
    this.stats = {
      total: s.total || 0,      // 累计总积分
      bestCombo: s.bestCombo || 0,
      luck: s.luck || 0,        // 蝴蝶助攻次数
      rim: s.rim || 0,          // 差一丢丢次数
      holes: s.holes || 0       // 累计打洞数
    };
    this.statsDirty = false;

    const skin = wx.getStorageSync(SKIN_KEY);
    if (SKINS[skin]) this.setData({ skin });
    this.setData({ total: this.stats.total, nick: wx.getStorageSync(NICK_KEY) || '' });

    this.particles = []; this.popups = [];
    this.ball = { x: 0, y: 0, vx: 0, vy: 0, spin: 0 };
    this.camX = 0;             // 相机水平偏移：球越过屏幕右缘时跟随，保证球与洞同屏
    this.trail = [];
    this.helper = null;

    // 窗口尺寸变化（iPad 分屏/旋转）时重测滑轨位置，避免角度映射错位
    this.resizeHandler = () => this.measureDial();
    if (wx.onWindowResize) wx.onWindowResize(this.resizeHandler);
  },

  onReady() {
    // 首帧渲染完成后再查询 canvas 节点：onLoad 时机查询可能取到 null，
    // 导致渲染循环永不启动（表现为场景不绘制、切皮肤无变化、开局无球场）
    this.initCanvas();
  },

  onUnload() {
    this.destroyed = true;
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    if (this.rafId && this.canvas) this.canvas.cancelAnimationFrame(this.rafId);
    if (this.actx && this.actx.close) { try { this.actx.close(); } catch (e) { /* 忽略 */ } }
    if (this.resizeHandler && wx.offWindowResize) wx.offWindowResize(this.resizeHandler);
    this.syncCloud();
  },

  onHide() {
    this.cancelCharge();   // 切后台中断蓄力：chargePower 基于绝对时间，回前台后相位会跳变
    this.syncCloud();
  },

  // ==================== Canvas 初始化 ====================
  initCanvas(retry) {
    wx.createSelectorQuery()
      .select('#game')
      .fields({ node: true, size: true })
      .exec(res => {
        if (this.destroyed) return;
        if (!res || !res[0] || !res[0].node) {
          // 节点尚未挂载：有限重试，避免初始化竞态导致整页交互失效
          if ((retry || 0) < 10) setTimeout(() => this.initCanvas((retry || 0) + 1), 100);
          return;
        }
        const canvas = res[0].node;
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = Math.min(info.pixelRatio || 1, 2);
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.vw = res[0].width;
        this.vh = res[0].height;
        canvas.width = this.vw * dpr;
        canvas.height = this.vh * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const S = this.S = clamp(this.vw / 400, 0.8, 1.15);
        this.groundY = this.vh * 0.72;
        this.ballX0 = this.vw * 0.12;
        this.ballR = 7 * S;
        this.holeR = 13 * S;
        this.gBase = 1500 * S;

        this.measureDial();

        // 云朵/星星装饰
        this.decos = [];
        for (let i = 0; i < 6; i++) {
          this.decos.push({ x: rand(0, this.vw), y: rand(20, this.vh * 0.3), r: rand(14, 34), spd: rand(3, 9) });
        }

        this.lastT = now();
        const loop = () => {
          if (this.destroyed) return;
          this.tick();
          this.rafId = canvas.requestAnimationFrame(loop);
        };
        this.rafId = canvas.requestAnimationFrame(loop);
      });
  },

  // 瞄准滑轨位置（用于把触点 X 换算成角度），窗口尺寸变化后需重测
  measureDial() {
    wx.createSelectorQuery().select('.aim-dial').boundingClientRect(rect => {
      if (rect) { this.dialLeft = rect.left; this.dialWidth = rect.width; }
    }).exec();
  },

  // ==================== 音效（WebAudio 轻量合成） ====================
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
      g.gain.setValueAtTime(Math.min(0.55, vol * SFX_GAIN), actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* 忽略音频错误 */ }
  },
  // 带通滤噪声（挥杆破空 / 草地滚动质感），噪声缓冲懒创建复用
  noiseBurst(freq, dur, vol, freqEnd) {
    if (this.destroyed) return;
    try {
      const actx = this.getAudioCtx();
      const t0 = actx.currentTime;
      if (!this.noiseBuf) {
        const len = Math.floor(actx.sampleRate * 1);
        this.noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = actx.createBufferSource(); src.buffer = this.noiseBuf;
      const bp = actx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.setValueAtTime(freq, t0); bp.Q.value = 1.2;
      if (freqEnd) bp.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
      const g = actx.createGain();
      g.gain.setValueAtTime(Math.min(0.5, vol * SFX_GAIN), t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(bp); bp.connect(g); g.connect(actx.destination);
      src.start(t0); src.stop(t0 + dur);
    } catch (e) { /* 忽略音频错误 */ }
  },
  // 蓄力"嗡嗡"：力度越大越急促、音调越高
  sfxCharge(p) { this.beep(180 + p * 420, .06, 'sawtooth', .06); },
  // 挥杆"嗖"破空
  sfxSwing(p) { this.noiseBurst(2600, .22, .3 + p * .2, 500); this.beep(700, .1, 'triangle', .1, -300); },
  // 落地弹跳闷响（按速度给音量）
  sfxBounce(v) { this.beep(clamp(90 + v * 0.06, 90, 200), .09, 'triangle', clamp(v / 2400, .05, .2)); },
  // 进洞"叮咚"
  sfxDing() { this.beep(1047, .12, 'sine', .22); setTimeout(() => this.beep(1319, .3, 'sine', .22), 110); },
  // 一杆进洞小号凯旋
  sfxAce() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.beep(f, i === 4 ? .34 : .12, 'square', .13), i * 85)); },
  // 差一点"哦——"遗憾长音（双层失谐下滑）
  sfxAww() { this.beep(440, .9, 'triangle', .16, -160); setTimeout(() => this.beep(444, .85, 'sine', .12, -170), 30); },
  // 擦洞金属脆响
  sfxLip() { this.beep(1568, .07, 'square', .12); this.beep(2093, .05, 'sine', .08); },
  // 运气球闪光琶音
  sfxLuck() { [880, 1109, 1319, 1760, 2217].forEach((f, i) => setTimeout(() => this.beep(f, .12, 'sine', .15), i * 70)); },
  // 飞出屏幕滑稽下滑
  sfxOut() { this.beep(500, .5, 'sawtooth', .13, -380); },
  // UI 点击
  sfxClick() { this.beep(600, .07, 'triangle', .12, 120); },
  // 慢放"咔哒"胶片声
  sfxFilm() { this.beep(240, .05, 'square', .08); },

  // ==================== 开局 / 球洞生成 ====================
  skinPhys() {
    // 每日一洞固定使用公园物理，全服公平；自由模式跟随皮肤
    return this.mode === 'daily' ? SKINS.park : SKINS[this.data.skin];
  },

  startFree() {
    this.sfxClick();
    this.playToken++;
    this.mode = 'free';
    this.sessionScore = 0;
    this.combo = 0;
    this.holeIdx = 0;
    this.setData({ phase: 'playing', mode: 'free', score: 0, combo: 0 });
    this.beginHole();
  },

  startDaily() {
    this.sfxClick();
    this.playToken++;
    this.mode = 'daily';
    this.sessionScore = 0;
    this.combo = 0;
    this.holeIdx = 0;
    this.dailyRng = seededRng('hole-' + todayStr());
    this.setData({ phase: 'playing', mode: 'daily', score: 0, combo: 0 });
    this.showBanner('⛳ 每日一洞', '全服同一球洞 · 共 5 洞取总分', 1600);
    this.beginHole();
  },

  // 生成新一洞：距离随机但保证"完美角度+完美力量=一杆进洞"必然存在
  beginHole() {
    // Canvas 尚未就绪（初始化回调未完成）时稍后重试，避免坐标 NaN
    if (!this.vw) {
      const tk = this.playToken;
      if (!this.destroyed) setTimeout(() => { if (!this.destroyed && tk === this.playToken) this.beginHole(); }, 150);
      return;
    }
    const rng = this.mode === 'daily' ? this.dailyRng : Math.random;
    const d = (0.4 + rng() * 0.38) * this.vw;              // 洞距：0.4 ~ 0.78 屏宽（任何机型都不触发下方 clamp，每日一洞全机型一致）
    this.holeX = clamp(this.ballX0 + d, 0, this.vw - 36 * this.S);
    this.ball.x = this.ballX0; this.ball.y = this.groundY;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.spin = 0;
    this.strokes = 1;
    this.trail = [];
    this.trailAcc = 0;
    this.helper = null;
    this.luckPlan = false; this.forceHole = false;
    this.sinking = 0;
    this.camX = 0;             // 新一洞相机复位
    this.state = 'aim';
    this.setData({
      holeNo: this.holeIdx + 1,
      distLabel: Math.round((this.holeX - this.ballX0) / (7 * this.S)) + ' 码',
      strokeTip: '第 1 杆',
      powerShow: false, powerPct: 0
    });
  },

  // ==================== 输入：瞄准 + 蓄力 ====================
  // 角度滑轨：左 15° → 右 75°
  onAimTouch(e) {
    if (this.state !== 'aim' && this.state !== 'charging') return;
    const t = e.touches && e.touches[0];
    if (!t || !this.dialWidth) return;
    const pct = clamp((t.clientX - this.dialLeft) / this.dialWidth, 0, 1);
    const deg = Math.round(15 + pct * 60);
    if (deg !== this.data.angleDeg) this.setData({ angleDeg: deg });
  },

  onPress(e) {
    // 触点落在角落按钮（data-ui）上：交给按钮的 tap 处理，不进入蓄力
    if (e && e.target && e.target.dataset && e.target.dataset.ui) return;
    if (this.state !== 'aim') return;
    this.state = 'charging';
    this.chargeStart = now();
    this.lastChargeTick = 0;
    this.power = 0;
    this.setData({ powerShow: true, powerPct: 0 });
  },

  onRelease(e) {
    // 松手落在角落按钮上：取消蓄力而非替玩家击球
    if (e && e.target && e.target.dataset && e.target.dataset.ui) { this.cancelCharge(); return; }
    if (this.state !== 'charging') return;
    this.setData({ powerShow: false });
    // 用松手瞬间的实时力量：避免按下后未经过渲染帧就松手时，拿到上一杆残留的 this.power
    this.shoot(this.chargePower());
  },

  // 触摸被系统打断（来电/通知栏/手势）：取消蓄力而非替玩家以随机力量击球
  onCancelPress() { this.cancelCharge(); },
  cancelCharge() {
    if (this.state !== 'charging') return;
    this.state = 'aim';
    this.power = 0;
    this.setData({ powerShow: false, powerPct: 0 });
  },

  // 蓄力条来回摆动（0→1→0），考验松手时机
  chargePower() {
    const t = ((now() - this.chargeStart) / 1300) % 2;
    return t < 1 ? t : 2 - t;
  },

  // ==================== 击球与物理 ====================
  shoot(p) {
    const phys = this.skinPhys();
    this.g = this.gBase * phys.gMul;
    this.fric = 300 * this.S * phys.fricMul;

    // 满力射程随皮肤重力换算（45° 约 1.06 屏）：避免月球低重力下大半力量区间必然飞出屏幕
    const vMax = Math.sqrt(this.g * this.vw * 1.06);
    const v = vMax * 0.3 + p * vMax * 0.7;
    const a = this.data.angleDeg * Math.PI / 180;
    // 第 2 杆若已越过球洞，自动反向朝洞打
    this.dir = this.holeX >= this.ball.x ? 1 : -1;
    this.ball.vx = Math.cos(a) * v * this.dir;
    this.ball.vy = -Math.sin(a) * v;
    this.state = 'flight';
    this.trail = [];
    this.trailAcc = 0;
    this.lipDone = false;
    this.sfxSwing(p);
    this.spawnParticles(this.ball.x, this.ball.y - 4, '#ffffff', 8);

    // 陷阱2：约 1% 概率安排"运气球"助攻（第 1 杆才触发，仪式感拉满）
    // 每日一洞是全服公平冲榜，不掺运气助攻
    this.luckPlan = this.mode !== 'daily' && this.strokes === 1 && Math.random() < 0.011;
    this.luckHelper = this.luckPlan ? pick(HELPERS) : null;
    this.forceHole = false;
  },

  // 主物理推进（flight / rolling），dt 秒
  updateBall(dt) {
    const b = this.ball;

    if (this.state === 'flight') {
      // 运气球：到达抛物线顶点时召唤小动物撞球改道
      if (this.luckPlan && !this.helper && b.vy >= 0) {
        this.luckPlan = false;
        this.helper = {
          icon: this.luckHelper.icon, name: this.luckHelper.name,
          x: b.x + 90 * this.S, y: b.y - 80 * this.S, t: 0
        };
      }
      if (this.helper && this.helper.t < 1) {
        // 小动物飞向球，接触瞬间重设弹道 → 必然进洞
        this.helper.t = Math.min(1, this.helper.t + dt / 0.3);
        this.helper.x = b.x + 90 * this.S * (1 - this.helper.t);
        this.helper.y = b.y - 80 * this.S * (1 - this.helper.t);
        if (this.helper.t >= 1 && !this.forceHole) {
          const T = 0.55;
          b.vx = (this.holeX - b.x) / T;
          b.vy = ((this.groundY - b.y) - 0.5 * this.g * T * T) / T;
          this.forceHole = true;
          this.sfxLuck();
          this.spawnParticles(b.x, b.y, '#fbbf24', 20);
        }
      } else if (this.helper) {
        // 助攻完成后飘然离场
        this.helper.x += 60 * dt;
        this.helper.y -= 90 * dt;
        if (this.helper.y < -40) this.helper = null;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += this.g * dt;
      b.spin += b.vx * dt * 0.06;

      if (b.y >= this.groundY) {
        b.y = this.groundY;
        const nearHole = Math.abs(b.x - this.holeX);
        if (this.forceHole && nearHole < this.holeR * 2) return this.holeIn();
        if (nearHole < this.holeR * 0.85) return this.holeIn();        // 直接飞进洞口
        if (nearHole < this.holeR * 1.5 && !this.lipDone) {
          // 陷阱1：擦着洞边弹开——就差一丢丢！
          this.lipDone = true;
          this.sfxLip();
          this.popups.push({ x: b.x, y: b.y - 46, text: '擦洞而过！', color: '#f87171', life: 1 });
        }
        if (Math.abs(b.vy) > 130) {
          this.sfxBounce(Math.abs(b.vy));
          b.vy = -b.vy * 0.42;
          b.vx *= 0.72;
          this.spawnParticles(b.x, b.y, 'rgba(255,255,255,.8)', 4);
        } else {
          b.vy = 0;
          this.state = 'rolling';
        }
      }
    } else if (this.state === 'rolling') {
      const prevX = b.x;
      b.x += b.vx * dt;
      b.spin += b.vx * dt * 0.14;
      // 滚过洞口：慢速掉洞，快速擦边越过
      const crossed = (prevX - this.holeX) * (b.x - this.holeX) <= 0 || Math.abs(b.x - this.holeX) < this.holeR * 0.9;
      if (crossed) {
        if (Math.abs(b.vx) < 240 * this.S || this.forceHole) return this.holeIn();
        if (!this.lipDone) {
          this.lipDone = true;
          this.sfxLip();
          b.vx *= 0.82;
          this.popups.push({ x: b.x, y: b.y - 40, text: '速度太快了！', color: '#f87171', life: 1 });
        }
      }
      const dec = this.fric * dt;
      if (Math.abs(b.vx) <= dec + 8) { b.vx = 0; return this.ballStopped(); }
      b.vx -= Math.sign(b.vx) * dec;
    }

    // 飞出屏幕判定
    if (b.x > this.vw + 26 || b.x < -26) {
      this.sfxOut();
      return this.settle('out');
    }
    // 轨迹记录（慢放回放用）：按模拟时间 60 采样/秒，保留最近约 1.2 秒，与帧率无关
    this.trailAcc += dt;
    if (this.trailAcc >= 1 / 60) {
      this.trailAcc = 0;
      this.trail.push({ x: b.x, y: b.y });
      if (this.trail.length > 76) this.trail.shift();
    }
  },

  // ==================== 结果判定 ====================
  holeIn() {
    this.ball.x = this.holeX;
    this.ball.y = this.groundY;
    this.ball.vx = 0; this.ball.vy = 0;
    this.state = 'wait';
    this.sinking = 0.001;                     // 进洞下沉动画
    this.sfxDing();
    const tk = this.playToken;
    if (this.forceHole) {
      // 运气球彩蛋：特效炸满屏
      this.stats.luck++;
      this.statsDirty = true;
      setTimeout(() => {
        if (this.destroyed || tk !== this.playToken) return;
        this.sfxLuck();
        this.spawnParticles(this.holeX, this.groundY - 40, '#fbbf24', 40);
        this.spawnParticles(this.holeX, this.groundY - 80, '#f472b6', 30);
        this.showBanner('✨ 天选之子！', this.luckHelper.name + '助攻进洞！快去炫耀吧', 2400);
      }, 350);
    }
    setTimeout(() => {
      if (tk !== this.playToken) return;
      this.settle(this.strokes === 1 ? 'ace' : 'holed2');
    }, this.forceHole ? 900 : 420);
  },

  ballStopped() {
    const gap = Math.max(0, Math.abs(this.ball.x - this.holeX) - this.holeR);
    if (gap <= 14 * this.S) {
      // 陷阱3：停在洞边——慢动作回放伺候
      this.lastGap = gap;
      return this.startReplay();
    }
    if (this.strokes === 1) {
      // 第 2 杆机会：从停球点再打
      this.strokes = 2;
      this.state = 'aim';
      this.setData({ strokeTip: '第 2 杆', powerPct: 0 });
      this.showBanner('还有救！', '第 2 杆 · 从停球点继续', 1300);
      return;
    }
    this.settle('stop');
  },

  // 计分并进入下一洞
  // outcome: ace(一杆进洞) | holed2(两杆进洞) | rim(洞边1cm) | stop(中途停下) | out(飞出屏幕)
  settle(outcome) {
    if (this.destroyed || this.state === 'idle') return;
    this.state = 'wait';
    let gain = 0;
    // 飘字位置按相机视野 clamp，球在屏幕右缘外时飘字也可见
    const bx = clamp(this.ball.x, this.camX + 40, this.camX + this.vw - 40);

    if (outcome === 'ace') {
      this.combo++;
      // 连击加成：1连100 / 2连120 / 之后每连 +30
      gain = this.combo === 1 ? 100 : this.combo === 2 ? 120 : 120 + 30 * (this.combo - 2);
      if (this.combo > this.stats.bestCombo) this.stats.bestCombo = this.combo;
      this.sfxAce();
      this.spawnParticles(this.holeX, this.groundY - 30, '#fbbf24', 30);
      this.popups.push({ x: bx, y: this.groundY - 90, text: '⛳ 一杆进洞 +' + gain, color: '#fbbf24', life: 1.2 });
      if (this.combo >= 2 && !this.forceHole) this.showBanner('🔥 连击 x' + this.combo, '下一杆 +' + (120 + 30 * (this.combo - 1)) + ' 分', 1500);
    } else if (outcome === 'holed2') {
      this.combo = 0;
      gain = 30;
      this.popups.push({ x: bx, y: this.groundY - 90, text: '两杆进洞 +30', color: '#4ade80', life: 1.1 });
    } else if (outcome === 'rim') {
      this.combo = 0;
      gain = 50;
      this.stats.rim++;
      this.popups.push({ x: bx, y: this.groundY - 90, text: '差一丢丢 +50', color: '#f472b6', life: 1.2 });
    } else if (outcome === 'stop') {
      this.combo = 0;
      this.popups.push({ x: bx, y: this.groundY - 90, text: '下次加油 +0', color: '#94a3b8', life: 1 });
    } else if (outcome === 'out') {
      this.combo = 0;
      gain = -20;
      this.popups.push({ x: bx, y: this.groundY - 90, text: '你在干嘛？ -20', color: '#f87171', life: 1.2 });
    }

    this.sessionScore += gain;
    this.stats.total += gain;
    this.stats.holes++;
    this.statsDirty = true;
    this.saveStats();
    this.setData({ score: this.sessionScore, total: this.stats.total, combo: this.combo });

    this.holeIdx++;
    const tk = this.playToken;
    setTimeout(() => {
      if (this.destroyed || tk !== this.playToken || this.data.phase !== 'playing') return;
      if (this.mode === 'daily' && this.holeIdx >= 5) return this.finishDaily();
      this.beginHole();
    }, 1300);
  },

  // ==================== 慢动作回放（陷阱3） ====================
  startReplay() {
    this.state = 'replay';
    this.replayIdx = Math.max(0, this.trail.length - 60);   // 回放最后一段轨迹
    this.replayClock = 0;
    this.setData({ replayShow: true });
    this.sfxFilm();
  },

  updateReplay(dt) {
    this.replayClock += dt;
    if (this.replayClock >= 0.15) { this.replayClock -= 0.15; this.sfxFilm(); }   // 胶片咖哒声
    this.replayIdx += 19.2 * dt;                            // 约 0.32 倍速慢放（轨迹 60 采样/秒），与帧率无关
    if (this.replayIdx >= this.trail.length - 1) {
      this.setData({ replayShow: false });
      const cm = Math.max(0.01, this.lastGap / (12 * this.S)).toFixed(2);
      this.showBanner('就差 ' + cm + ' 厘米！', '再轻一点就进了！', 2000);
      this.sfxAww();
      this.settle('rim');
    }
  },

  // ==================== 每日一洞结算 ====================
  finishDaily() {
    const today = todayStr();
    let daily = wx.getStorageSync(DAILY_KEY) || {};
    if (daily.date !== today) daily = { date: today, best: -9999 };
    const isNew = this.sessionScore > daily.best;
    if (isNew) {
      daily.best = this.sessionScore;
      wx.setStorageSync(DAILY_KEY, daily);
      this.statsDirty = true;
    }
    this.setData({
      phase: 'daily-over',
      overScore: this.sessionScore,
      overBest: daily.best,
      overNew: isNew
    });
    this.state = 'idle';
    this.syncCloud();
  },

  // ==================== 持久化与云同步 ====================
  saveStats() { wx.setStorageSync(STATS_KEY, this.stats); },

  syncCloud() {
    if (!this.cloudOk || !this.statsDirty) return Promise.resolve();
    this.statsDirty = false;
    const daily = wx.getStorageSync(DAILY_KEY) || {};
    return wx.cloud.callFunction({
      name: 'golf',
      data: {
        action: 'sync',
        nickname: wx.getStorageSync(NICK_KEY) || '',
        total: this.stats.total,
        bestCombo: this.stats.bestCombo,
        luck: this.stats.luck,
        rim: this.stats.rim,
        holes: this.stats.holes,
        dailyDate: daily.date || '',
        dailyBest: daily.best || 0
      }
    }).catch(() => { this.statsDirty = true; });   // 失败下次再同步
  },

  // ==================== 排行榜 UI ====================
  openRank() {
    this.sfxClick();
    this.setData({ rankShow: true, rankLoading: true, rankErr: '', rankList: [], myRankText: '' });
    // 有未同步战绩才上云（syncCloud 对干净数据直接 resolve），避免每次开榜都白写一次
    // 等同步完成再拉榜，否则榜单可能显示同步前的旧成绩
    this.syncCloud().then(() => {
      if (!this.destroyed && this.data.rankShow) this.loadBoard(this.data.rankTab);
    });
  },
  closeRank() { this.sfxClick(); this.setData({ rankShow: false }); },
  onRankTab(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.rankTab) return;
    this.sfxClick();
    this.setData({ rankTab: key });
    this.loadBoard(key);
  },

  loadBoard(type) {
    if (!this.cloudOk) {
      this.setData({ rankLoading: false, rankErr: '当前环境不支持云排行榜', rankList: [], myRankText: '' });
      return;
    }
    this.setData({ rankLoading: true, rankErr: '', rankList: [], myRankText: '' });
    wx.cloud.callFunction({
      name: 'golf',
      data: { action: 'board', type, date: todayStr() }
    }).then(res => {
      if (this.destroyed || this.data.rankTab !== type) return;
      const r = res.result || {};
      if (!r.success) throw new Error(r.message || '加载失败');
      this.setData({
        rankLoading: false,
        rankList: r.list || [],
        myRankText: r.myRank ? ('我的排名：第 ' + r.myRank + ' 名 · ' + r.myValue) : '暂未上榜，先打几杆吧'
      });
    }).catch(() => {
      if (this.destroyed) return;
      this.setData({ rankLoading: false, rankErr: '榜单加载失败，稍后再试' });
    });
  },

  onNickInput(e) { this.nickTmp = e.detail.value; },
  saveNick() {
    // 未输入时回落到已保存昵称（placeholder 展示旧昵称，用户可能直接点保存）
    const raw = this.nickTmp !== undefined ? this.nickTmp : this.data.nick;
    const nick = (raw || '').trim().slice(0, 12);
    if (!nick) { wx.showToast({ title: '请先输入昵称', icon: 'none' }); return; }
    this.sfxClick();
    wx.setStorageSync(NICK_KEY, nick);
    this.setData({ nick });
    this.statsDirty = true;
    this.syncCloud();
    wx.showToast({ title: '昵称已保存', icon: 'success' });
  },

  // ==================== 提示横幅 / 粒子 / 飘字 ====================
  showBanner(text, sub, dur) {
    this.setData({ bannerText: text, bannerSub: sub || '', bannerShow: true });
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      if (!this.destroyed) this.setData({ bannerShow: false });
    }, dur || 1500);
  },

  spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(50, 240);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90, life: 1, color, r: rand(2, 5) });
    }
  },

  // ==================== 渲染 ====================
  drawBackground(dt, skin) {
    const { ctx, vw, vh } = this;
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, skin.sky[0]); g.addColorStop(0.55, skin.sky[1]); g.addColorStop(1, skin.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    // 装饰：夜景画星星，白天画云
    const night = this.data.skin === 'neon' || this.data.skin === 'moon';
    for (const c of this.decos) {
      if (night) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.5 * Math.abs(Math.sin(now() / 900 + c.x))) + ')';
        ctx.beginPath(); ctx.arc(c.x, c.y, 1.6, 0, Math.PI * 2); ctx.fill();
      } else {
        c.x -= c.spd * dt;
        if (c.x < -60) c.x = vw + 60;
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.arc(c.x + c.r * 0.8, c.y + 4, c.r * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 远山/远景
    ctx.fillStyle = skin.far;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.quadraticCurveTo(vw * 0.25, this.groundY - 70, vw * 0.5, this.groundY);
    ctx.quadraticCurveTo(vw * 0.78, this.groundY - 100, vw, this.groundY);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 草地
    const gg = ctx.createLinearGradient(0, this.groundY, 0, vh);
    gg.addColorStop(0, skin.ground); gg.addColorStop(1, skin.groundDeep);
    ctx.fillStyle = gg;
    ctx.fillRect(0, this.groundY, vw, vh - this.groundY);
    // 草纹
    ctx.strokeStyle = 'rgba(0,0,0,.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = this.groundY + 14 + i * 16;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke();
    }
  },

  drawHole() {
    const { ctx } = this;
    const hx = this.holeX, gy = this.groundY;
    // 洞口（椭圆）
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(hx, gy + 2, this.holeR, this.holeR * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    // 旗杆 + 摆动小旗
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(hx, gy); ctx.lineTo(hx, gy - 64 * this.S); ctx.stroke();
    const wave = Math.sin(now() / 260) * 5;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(hx, gy - 64 * this.S);
    ctx.lineTo(hx + 26 * this.S, gy - 57 * this.S + wave);
    ctx.lineTo(hx, gy - 48 * this.S);
    ctx.closePath(); ctx.fill();
  },

  drawAim() {
    if (this.state !== 'aim' && this.state !== 'charging') return;
    const { ctx } = this;
    const a = this.data.angleDeg * Math.PI / 180;
    const dir = this.holeX >= this.ball.x ? 1 : -1;
    const len = 60 * this.S + (this.state === 'charging' ? this.power * 46 * this.S : 0);
    const x0 = this.ball.x, y0 = this.ball.y - this.ballR;
    const x1 = x0 + Math.cos(a) * len * dir, y1 = y0 - Math.sin(a) * len;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.setLineDash([]);
    // 箭头
    const aa = Math.atan2(y1 - y0, x1 - x0);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 11 * Math.cos(aa - 0.45), y1 - 11 * Math.sin(aa - 0.45));
    ctx.lineTo(x1 - 11 * Math.cos(aa + 0.45), y1 - 11 * Math.sin(aa + 0.45));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  drawBall(x, y, sinkT) {
    const { ctx } = this;
    const r = this.ballR * (1 - 0.5 * sinkT);
    ctx.save();
    if (sinkT > 0) {
      // 进洞下沉：裁剪到洞口以下不可见
      ctx.beginPath();
      ctx.rect(0, 0, this.vw, this.groundY + 3);
      ctx.clip();
      y += sinkT * this.holeR * 1.6;
    }
    // 阴影
    if (y < this.groundY - 2) {
      const air = clamp(1 - (this.groundY - y) / 260, 0.15, 1);
      ctx.fillStyle = 'rgba(0,0,0,' + 0.22 * air + ')';
      ctx.beginPath();
      ctx.ellipse(x, this.groundY + 3, r * air + 3, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 球体 + 高光 + 旋转纹（体现滚动手感）
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.2, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y - r, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(100,116,139,.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y - r, r * 0.55, this.ball.spin, this.ball.spin + Math.PI * 1.2);
    ctx.stroke();
    ctx.restore();
  },

  drawHelperIcon() {
    if (!this.helper) return;
    const { ctx } = this;
    ctx.font = 26 * this.S + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const bob = Math.sin(now() / 90) * 4;
    ctx.fillText(this.helper.icon, this.helper.x, this.helper.y + bob);
  },

  drawFx(dt) {
    const ctx = this.ctx;
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) {
      p.life -= dt * 1.5;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 360 * dt;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.popups = this.popups.filter(p => p.life > 0);
    for (const p of this.popups) {
      p.life -= dt * 0.8;
      p.y -= 42 * dt;
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.font = '800 ' + Math.round(19 * this.S) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  },

  // ==================== 主循环 ====================
  tick() {
    const t = now();
    const dt = Math.min(0.033, (t - this.lastT) / 1000);
    this.lastT = t;
    const skin = SKINS[this.data.skin];

    // 蓄力：来回摆动的力量条 + 越来越急促的嗡嗡声
    if (this.state === 'charging') {
      this.power = this.chargePower();
      const pct = Math.round(this.power * 100);
      if (Math.abs(pct - this.data.powerPct) >= 2) this.setData({ powerPct: pct });
      if (t - this.lastChargeTick >= 150 - this.power * 95) {
        this.lastChargeTick = t;
        this.sfxCharge(this.power);
      }
    }

    if (this.state === 'flight' || this.state === 'rolling') {
      // 物理子步进：高速球单帧位移可达 20+ px，切小步长防止跨帧掠过洞口判定窗口
      const n = Math.min(8, Math.max(1, Math.ceil(dt / 0.0085)));
      const sub = dt / n;
      for (let i = 0; i < n; i++) {
        if (this.state !== 'flight' && this.state !== 'rolling') break;
        this.updateBall(sub);
      }
    }
    // 球已落地（rolling/wait）但助攻小动物还在场：让它继续飘走，避免僵在半空
    if (this.state !== 'flight' && this.helper) {
      this.helper.x += 60 * dt;
      this.helper.y -= 90 * dt;
      if (this.helper.y < -40) this.helper = null;
    }
    if (this.state === 'replay') this.updateReplay(dt);
    if (this.sinking > 0 && this.sinking < 1) this.sinking = Math.min(1, this.sinking + dt * 3.4);

    // ---- 绘制 ----
    const replaying = this.state === 'replay';
    if (!replaying) this.drawBackground(dt, skin);   // 慢放时镜头内会整屏重画背景，外层这次省掉
    if (this.data.phase === 'playing' || this.data.phase === 'daily-over') {
      if (replaying) {
        // 慢放镜头：以球洞为中心放大 1.5 倍
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(this.holeX, this.groundY);
        ctx.scale(1.5, 1.5);
        ctx.translate(-this.holeX, -this.groundY + 20);
        this.drawBackground(dt, skin);
        this.drawHole();
        // 轨迹虚线
        ctx.strokeStyle = 'rgba(255,255,255,.4)';
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        for (let i = 0; i < this.trail.length; i++) {
          const p = this.trail[i];
          if (i === 0) ctx.moveTo(p.x, p.y - this.ballR); else ctx.lineTo(p.x, p.y - this.ballR);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        const rp = this.trail[Math.floor(this.replayIdx)] || this.ball;
        this.drawBall(rp.x, rp.y, 0);
        ctx.restore();
        // 电影黑边
        ctx.fillStyle = 'rgba(0,0,0,.8)';
        ctx.fillRect(0, 0, this.vw, 44);
        ctx.fillRect(0, this.vh - 44, this.vw, 44);
      } else {
        const ctx = this.ctx;
        // 相机跟随：球越过屏幕右缘（尚未出界）时平移视角，让球和球洞始终同屏；
        // 世界层（洞/球/瞄准线/粒子）整体平移，背景与 WXML HUD 不动
        const camTarget = Math.max(0, this.ball.x + 70 * this.S - this.vw);
        this.camX += (camTarget - this.camX) * Math.min(1, dt * 6);
        if (camTarget === 0 && this.camX < 0.5) this.camX = 0;
        ctx.save();
        ctx.translate(-this.camX, 0);
        this.drawHole();
        this.drawAim();
        this.drawBall(this.ball.x, this.ball.y, this.sinking);
        this.drawHelperIcon();
        this.drawFx(dt);          // 粒子/飘字是世界坐标，跟随相机平移
        ctx.restore();
      }
    } else {
      this.drawFx(dt);
    }
    if (replaying) this.drawFx(dt);
  },

  // ==================== UI 事件 ====================
  onSelectSkin(e) {
    this.sfxClick();
    const skin = e.currentTarget.dataset.skin;
    if (!SKINS[skin]) return;
    wx.setStorageSync(SKIN_KEY, skin);
    this.setData({ skin });
  },
  onBackMenu() {
    this.sfxClick();
    this.playToken++;          // 作废本局所有未触发的延时回调（结算/下一洞/彩蛋横幅）
    this.state = 'idle';
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.setData({ phase: 'start', powerShow: false, replayShow: false, bannerShow: false });
    this.syncCloud();
  },
  onRetryDaily() { this.startDaily(); },
  onBackHome() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' })
    });
  },
  // 空处理器：阻断按钮上的触摸冒泡
  noop() {}
});
