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
    windLabel: '',             // 风力显示：无风 / 顺风·逆风 x 级
    windCls: '',               // tail=顺风(绿) head=逆风(红)
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
    // 真实高尔夫要素：风力 / 沙坑 / 水塘 / 3 杆制（beginHole 按洞数渐进生成）
    this.wind = 0; this.windLv = 0;
    this.bunker = null; this.water = null;
    this.sandLie = false;      // 球停在沙坑里：下一杆力量打折
    this.maxStrokes = 3;
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

        // 按当前皮肤生成专属背景装饰（云/星/楼群/仙人掌/环形山……）
        this.buildDecos();

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
  // 陷进沙坑的闷"噗"
  sfxSand() { this.noiseBurst(300, .18, .3, 120); },
  // 落水"扑通"
  sfxSplash() { this.beep(300, .25, 'sine', .2, -180); this.noiseBurst(900, .35, .35, 300); },
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
    this.genHazards(rng);                                  // 风力 / 沙坑 / 水塘（随洞数渐进）
    this.ball.x = this.ballX0; this.ball.y = this.groundY;
    this.ball.vx = 0; this.ball.vy = 0; this.ball.spin = 0;
    this.strokes = 1;
    this.sandLie = false;
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
      strokeTip: '第 1/' + this.maxStrokes + ' 杆',
      windLabel: this.windText(),
      windCls: this.windLv === 0 ? '' : this.wind > 0 ? 'tail' : 'head',
      powerShow: false, powerPct: 0
    });
  },

  // 真实高尔夫要素：按洞数渐进生成风与障碍。
  // rng 可传每日种子随机（调用次数固定为 9 次，保证全服同一布局）
  genHazards(rng) {
    const idx = this.holeIdx, S = this.S;
    // 风：第 1~2 洞 ≤1 级，3~4 洞 ≤2 级，之后 ≤3 级；正=顺风(向洞)
    const maxLv = idx < 2 ? 1 : idx < 4 ? 2 : 3;
    this.windLv = Math.floor(rng() * (maxLv + 1));
    const dir = rng() < 0.5 ? -1 : 1;
    this.wind = dir * this.windLv * 58 * S;                // 横向加速度 px/s²

    // 障碍概率随洞数上升；第 7 洞起沙坑水塘可同时出现
    const pBunker = idx < 2 ? 0 : idx < 4 ? 0.3 : idx < 6 ? 0.5 : 0.6;
    const pWater = idx < 4 ? 0 : idx < 6 ? 0.3 : 0.4;
    // 固定消耗 rng：命中与否都取值，保证每日种子序列全服一致
    const rB = rng(), wB = (60 + rng() * 30) * S, sB = rng(), pB = rng();
    const rW = rng(), wW = (70 + rng() * 40) * S, sW = rng(), pW = rng();
    this.bunker = rB < pBunker ? this.placeZone(wB, sB, pB, null) : null;
    let water = rW < pWater ? this.placeZone(wW, sW, pW, this.bunker) : null;
    if (water && idx < 6 && this.bunker) water = null;     // 第 7 洞前二者不同时出现
    this.water = water;
  },

  // 在球洞之间 / 洞后方选一段障碍区，避开洞口 3 倍洞半径与已有障碍
  placeZone(w, side, pos, avoid) {
    const S = this.S, safe = this.holeR * 3;
    const gapLo = this.ballX0 + 70 * S, gapHi = this.holeX - safe;
    const backLo = this.holeX + safe, backHi = this.vw - 16;
    let lo, hi;
    if (side < 0.65 && gapHi - gapLo > w + 20) { lo = gapLo; hi = gapHi; }
    else if (backHi - backLo > w + 20) { lo = backLo; hi = backHi; }
    else if (gapHi - gapLo > w + 20) { lo = gapLo; hi = gapHi; }
    else return null;
    const x0 = lo + pos * (hi - lo - w);
    const z = { x0, x1: x0 + w };
    // 与已有障碍重叠则放弃（布局仍然全服确定）
    if (avoid && z.x1 > avoid.x0 - 16 && z.x0 < avoid.x1 + 16) return null;
    return z;
  },

  inZone(z, x) { return !!z && x >= z.x0 && x <= z.x1; },

  windText() {
    if (!this.windLv) return '🍃 无风';
    return '💨 ' + (this.wind > 0 ? '顺风 →' : '← 逆风') + ' ' + this.windLv + ' 级';
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
    let v = vMax * 0.3 + p * vMax * 0.7;
    if (this.sandLie) { v *= 0.75; this.sandLie = false; }   // 沙坑救球：出杆力量打七五折
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
      b.vx += this.wind * dt;                              // 横风持续吹偏弹道
      b.spin += b.vx * dt * 0.06;

      if (b.y >= this.groundY) {
        b.y = this.groundY;
        if (this.inZone(this.water, b.x)) return this.splashIn();   // 落水：罚杆捞回岸边
        const nearHole = Math.abs(b.x - this.holeX);
        if (this.forceHole && nearHole < this.holeR * 2) return this.holeIn();
        if (nearHole < this.holeR * 0.85) return this.holeIn();        // 直接飞进洞口
        if (nearHole < this.holeR * 1.5 && !this.lipDone) {
          // 陷阱1：擦着洞边弹开——就差一丢丢！
          this.lipDone = true;
          this.sfxLip();
          this.popups.push({ x: b.x, y: b.y - 46, text: '擦洞而过！', color: '#f87171', life: 1 });
        }
        if (this.inZone(this.bunker, b.x) && Math.abs(b.vy) > 90) {
          // 沙坑吃掉弹跳：扬沙闷响，球几乎原地陷住
          this.sfxSand();
          this.spawnParticles(b.x, b.y, 'rgba(214,178,110,.9)', 8);
          b.vy = -b.vy * 0.15;
          b.vx *= 0.4;
          if (Math.abs(b.vy) < 100) { b.vy = 0; this.state = 'rolling'; }
        } else if (Math.abs(b.vy) > 130) {
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
      if (this.inZone(this.water, b.x)) return this.splashIn();   // 滚进水塘同样罚杆
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
      // 沙坑内滚动阻力翻 4 倍，球很快陷停
      const dec = this.fric * (this.inZone(this.bunker, b.x) ? 4 : 1) * dt;
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
  // 落水：水花 + 罚 10 分并消耗一杆，球捞回近岸重打；杆数用完按 Bogey 收场
  splashIn() {
    const b = this.ball;
    this.sfxSplash();
    this.spawnParticles(b.x, this.groundY, 'rgba(96,165,250,.9)', 18);
    this.popups.push({ x: b.x, y: this.groundY - 60, text: '💦 落水 -10', color: '#60a5fa', life: 1.2 });
    this.sessionScore -= 10;
    this.stats.total -= 10;
    this.statsDirty = true;
    this.setData({ score: this.sessionScore, total: this.stats.total });
    b.vx = 0; b.vy = 0; b.y = this.groundY;
    this.state = 'wait';
    const tk = this.playToken;
    if (this.strokes >= this.maxStrokes) {
      setTimeout(() => {
        if (this.destroyed || tk !== this.playToken) return;
        this.settle('stop');                               // 没杆了：Bogey 收场
      }, 700);
      return;
    }
    this.strokes++;
    setTimeout(() => {
      if (this.destroyed || tk !== this.playToken || this.data.phase !== 'playing') return;
      b.x = Math.max(20, this.water.x0 - 24 * this.S);     // 捞回近岸边缘
      b.y = this.groundY;
      this.sandLie = false;
      this.state = 'aim';
      this.setData({ strokeTip: '第 ' + this.strokes + '/' + this.maxStrokes + ' 杆', powerPct: 0 });
      this.showBanner('💦 下水了！', '罚一杆 · 从岸边继续', 1400);
    }, 800);
  },

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
      this.settle(this.strokes === 1 ? 'ace' : this.strokes === 2 ? 'birdie' : 'par');
    }, this.forceHole ? 900 : 420);
  },

  ballStopped() {
    const gap = Math.max(0, Math.abs(this.ball.x - this.holeX) - this.holeR);
    if (gap <= 14 * this.S) {
      // 陷阱3：停在洞边——慢动作回放伺候
      this.lastGap = gap;
      return this.startReplay();
    }
    if (this.strokes < this.maxStrokes) {
      // 还有杆数：从停球点继续；停在沙坑里则下一杆力量打折
      this.strokes++;
      const inSand = this.inZone(this.bunker, this.ball.x);
      this.sandLie = inSand;
      this.state = 'aim';
      this.setData({ strokeTip: '第 ' + this.strokes + '/' + this.maxStrokes + ' 杆' + (inSand ? ' · 沙坑' : ''), powerPct: 0 });
      this.showBanner(
        inSand ? '🏖️ 陷进沙坑了！' : '还有救！',
        inSand ? '沙坑救球 · 这杆力量打七五折' : '第 ' + this.strokes + ' 杆 · 从停球点继续',
        1300
      );
      return;
    }
    this.settle('stop');
  },

  // 计分并进入下一洞（高尔夫术语计分）
  // outcome: ace(一杆进洞) | birdie(两杆) | par(三杆) | rim(洞边1cm) | stop(未进=Bogey) | out(飞出屏幕)
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
      this.popups.push({ x: bx, y: this.groundY - 90, text: '⛳ Ace 一杆进洞 +' + gain, color: '#fbbf24', life: 1.2 });
      if (this.combo >= 2 && !this.forceHole) this.showBanner('🔥 连击 x' + this.combo, '下一杆 +' + (120 + 30 * (this.combo - 1)) + ' 分', 1500);
    } else if (outcome === 'birdie') {
      this.combo = 0;
      gain = 40;
      this.popups.push({ x: bx, y: this.groundY - 90, text: '🐦 Birdie 两杆进洞 +40', color: '#4ade80', life: 1.1 });
    } else if (outcome === 'par') {
      this.combo = 0;
      gain = 15;
      this.popups.push({ x: bx, y: this.groundY - 90, text: 'Par 三杆进洞 +15', color: '#a3e635', life: 1.1 });
    } else if (outcome === 'rim') {
      this.combo = 0;
      gain = 50;
      this.stats.rim++;
      this.popups.push({ x: bx, y: this.groundY - 90, text: '差一丢丢 +50', color: '#f472b6', life: 1.2 });
    } else if (outcome === 'stop') {
      this.combo = 0;
      this.popups.push({ x: bx, y: this.groundY - 90, text: 'Bogey 下次加油 +0', color: '#94a3b8', life: 1 });
    } else if (outcome === 'out') {
      this.combo = 0;
      gain = -20;
      this.popups.push({ x: bx, y: this.groundY - 90, text: '你在干嘛？OB -20', color: '#f87171', life: 1.2 });
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
  // 按皮肤生成专属装饰物集合（initCanvas / 切皮肤时重建）
  buildDecos() {
    if (!this.vw) return;
    const vw = this.vw, vh = this.vh, gy = this.groundY;
    const key = this.data.skin;
    const d = { clouds: [], stars: [], buildings: [], trees: [], flowers: [], cacti: [], pebbles: [], craters: [], earth: null };

    if (key === 'park') {
      // 两层视差积云：近层大而快，远层小而慢
      for (let i = 0; i < 3; i++) d.clouds.push({ x: rand(0, vw), y: rand(24, vh * 0.2), s: rand(0.85, 1.2), spd: rand(8, 14), a: 0.92 });
      for (let i = 0; i < 3; i++) d.clouds.push({ x: rand(0, vw), y: rand(vh * 0.08, vh * 0.28), s: rand(0.45, 0.7), spd: rand(3, 6), a: 0.55 });
      // 地平线一排圆冠树影
      let tx = rand(10, 60);
      while (tx < vw) { d.trees.push({ x: tx, r: rand(13, 24) }); tx += rand(55, 120); }
      // 草地小花
      for (let i = 0; i < 14; i++) d.flowers.push({ x: rand(0, vw), y: rand(gy + 18, vh - 10), c: pick(['#f472b6', '#fbbf24', '#ffffff']) });
    } else if (key === 'neon') {
      for (let i = 0; i < 42; i++) d.stars.push({ x: rand(0, vw), y: rand(0, gy - 130), tw: rand(0, Math.PI * 2) });
      // 城市楼群剪影 + 点亮的窗
      let bx = -rand(0, 20);
      while (bx < vw) {
        const w = rand(28, 62), h = rand(46, 150), wins = [];
        for (let wy = 10; wy < h - 10; wy += 15) {
          for (let wx = 6; wx < w - 8; wx += 12) if (Math.random() < 0.38) wins.push({ x: wx, y: wy });
        }
        d.buildings.push({ x: bx, w, h, wins });
        bx += w + rand(4, 16);
      }
    } else if (key === 'desert') {
      // 扁长薄云 1~2 朵
      d.clouds.push({ x: rand(0, vw), y: rand(30, vh * 0.16), s: rand(0.9, 1.2), spd: rand(4, 7), a: 0.4, flat: true });
      if (Math.random() < 0.7) d.clouds.push({ x: rand(0, vw), y: rand(vh * 0.14, vh * 0.26), s: rand(0.55, 0.8), spd: rand(2, 4), a: 0.28, flat: true });
      // 仙人掌剪影 + 地面石子
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) d.cacti.push({ x: rand(vw * 0.08, vw * 0.92), h: rand(26, 46) * this.S });
      for (let i = 0; i < 12; i++) d.pebbles.push({ x: rand(0, vw), y: rand(gy + 16, vh - 8), r: rand(1.5, 3.5) });
    } else {
      // 月球：满天星 + 悬空地球 + 月面环形山
      for (let i = 0; i < 54; i++) d.stars.push({ x: rand(0, vw), y: rand(0, gy - 30), tw: rand(0, Math.PI * 2) });
      d.earth = { x: vw * rand(0.66, 0.82), y: vh * rand(0.1, 0.18), r: 15 * this.S };
      for (let i = 0; i < 4; i++) d.craters.push({ x: rand(24, vw - 24), y: rand(gy + 18, vh - 14), r: rand(9, 22) });
    }
    this.deco = d;
  },

  // 蓬松积云：多段圆弧拼出"上蓬下平"轮廓后一次填充（无内部接缝）；flat=扁长薄云
  drawCloud(x, y, s, alpha, flat) {
    const ctx = this.ctx;
    const k = this.S * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, y - 30 * k, 0, y + 12 * k);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, flat ? 'rgba(255,255,255,.7)' : '#d7e3ee');   // 底部微灰营造体积感
    ctx.fillStyle = g;
    ctx.beginPath();
    if (flat) {
      ctx.ellipse(x, y, 52 * k, 8 * k, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 34 * k, y + 5 * k, 32 * k, 6 * k, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(x - 30 * k, y + 3 * k, 13 * k, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(x - 15 * k, y - 9 * k, 14 * k, Math.PI * 0.95, Math.PI * 1.75);
      ctx.arc(x + 3 * k, y - 14 * k, 16 * k, Math.PI * 1.05, Math.PI * 1.9);
      ctx.arc(x + 21 * k, y - 7 * k, 13 * k, Math.PI * 1.25, Math.PI * 1.98);
      ctx.arc(x + 33 * k, y + 3 * k, 11 * k, Math.PI * 1.5, Math.PI * 0.5);
      ctx.closePath();                                              // 平底封口
    }
    ctx.fill();
    ctx.restore();
  },

  // 仙人掌剪影：主干 + 左右两条弯臂
  drawCactus(x, gy, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(22,78,52,.75)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy - h); ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, gy - h * 0.55); ctx.lineTo(x - 9, gy - h * 0.58); ctx.lineTo(x - 9, gy - h * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, gy - h * 0.38); ctx.lineTo(x + 9, gy - h * 0.42); ctx.lineTo(x + 9, gy - h * 0.68);
    ctx.stroke();
    ctx.restore();
  },

  drawBackground(dt, skin) {
    const { ctx, vw, vh } = this;
    const key = this.data.skin;
    const d = this.deco || { clouds: [], stars: [], buildings: [], trees: [], flowers: [], cacti: [], pebbles: [], craters: [] };
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, skin.sky[0]); g.addColorStop(0.55, skin.sky[1]); g.addColorStop(1, skin.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    // ---- 天空主角（各皮肤专属） ----
    if (key === 'park') {
      // 晨光太阳 + 光晕
      const sx = vw * 0.84, sy = vh * 0.13;
      const halo = ctx.createRadialGradient(sx, sy, 4, sx, sy, 58);
      halo.addColorStop(0, 'rgba(253,224,71,.85)'); halo.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sx, sy, 58, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(sx, sy, 18, 0, Math.PI * 2); ctx.fill();
    } else if (key === 'desert') {
      // 灼热大橙日
      const sx = vw * 0.76, sy = vh * 0.15;
      const halo = ctx.createRadialGradient(sx, sy, 6, sx, sy, 76);
      halo.addColorStop(0, 'rgba(251,146,60,.8)'); halo.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sx, sy, 76, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.arc(sx, sy, 27, 0, Math.PI * 2); ctx.fill();
    } else if (key === 'neon') {
      // 月牙：大圆减去偏移的天空色圆
      const mx = vw * 0.82, my = vh * 0.12;
      ctx.fillStyle = '#fef9c3'; ctx.beginPath(); ctx.arc(mx, my, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = skin.sky[0]; ctx.beginPath(); ctx.arc(mx - 7, my - 4, 13, 0, Math.PI * 2); ctx.fill();
    } else if (d.earth) {
      // 月球视角的地球：蓝底 + 绿斑 + 大气光晕
      const e = d.earth;
      ctx.save();
      ctx.strokeStyle = 'rgba(147,197,253,.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath(); ctx.ellipse(e.x - e.r * 0.35, e.y - e.r * 0.25, e.r * 0.45, e.r * 0.3, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(e.x + e.r * 0.4, e.y + e.r * 0.35, e.r * 0.35, e.r * 0.22, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 星星（霓虹 / 月球）
    for (const s of d.stars) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.55 * Math.abs(Math.sin(now() / 900 + s.tw + s.x))) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    // 云（公园积云 / 沙漠薄云），持续向左漂
    for (const c of d.clouds) {
      c.x -= c.spd * dt;
      if (c.x < -90 * c.s * this.S) c.x = vw + 90 * c.s * this.S;
      this.drawCloud(c.x, c.y, c.s, c.a, c.flat);
    }

    // ---- 地平线远景 ----
    if (key === 'neon') {
      for (const b of d.buildings) {
        ctx.fillStyle = 'rgba(10,14,28,.88)';
        ctx.fillRect(b.x, this.groundY - b.h, b.w, b.h);
        ctx.fillStyle = 'rgba(250,204,21,.7)';
        for (const w of b.wins) ctx.fillRect(b.x + w.x, this.groundY - b.h + w.y, 4, 6);
      }
    } else if (key === 'desert') {
      // 层叠沙丘
      ctx.fillStyle = skin.far;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(0, this.groundY);
      ctx.quadraticCurveTo(vw * 0.5, this.groundY - 120, vw, this.groundY);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, this.groundY);
      ctx.quadraticCurveTo(vw * 0.22, this.groundY - 80, vw * 0.48, this.groundY);
      ctx.quadraticCurveTo(vw * 0.72, this.groundY - 55, vw, this.groundY);
      ctx.fill();
      ctx.globalAlpha = 1;
      for (const c of d.cacti) this.drawCactus(c.x, this.groundY, c.h);
    } else if (key === 'park') {
      // 远山 + 一排树影
      ctx.fillStyle = skin.far;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, this.groundY);
      ctx.quadraticCurveTo(vw * 0.25, this.groundY - 70, vw * 0.5, this.groundY);
      ctx.quadraticCurveTo(vw * 0.78, this.groundY - 100, vw, this.groundY);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(22,101,52,.5)';
      for (const t of d.trees) {
        ctx.fillRect(t.x - 2, this.groundY - t.r - 9, 4, t.r + 9);
        ctx.beginPath(); ctx.arc(t.x, this.groundY - t.r - 10, t.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    // 月球：无远山无云，保留纯净地平线

    // ---- 地面 ----
    const gg = ctx.createLinearGradient(0, this.groundY, 0, vh);
    gg.addColorStop(0, skin.ground); gg.addColorStop(1, skin.groundDeep);
    ctx.fillStyle = gg;
    ctx.fillRect(0, this.groundY, vw, vh - this.groundY);

    // ---- 地面细节（各皮肤专属） ----
    if (key === 'park') {
      ctx.strokeStyle = 'rgba(0,0,0,.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = this.groundY + 14 + i * 16;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke();
      }
      for (const f of d.flowers) {
        ctx.fillStyle = f.c;
        ctx.beginPath(); ctx.arc(f.x, f.y, 2, 0, Math.PI * 2); ctx.fill();
      }
    } else if (key === 'neon') {
      // 暗色路面 + 霓虹边缘灯带
      ctx.strokeStyle = 'rgba(255,255,255,.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const y = this.groundY + 20 + i * 18;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(232,121,249,.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([16, 20]);
      ctx.beginPath(); ctx.moveTo(0, this.groundY + 2); ctx.lineTo(vw, this.groundY + 2); ctx.stroke();
      ctx.setLineDash([]);
    } else if (key === 'desert') {
      // 沙纹波浪 + 石子
      ctx.strokeStyle = 'rgba(120,53,15,.16)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const y = this.groundY + 18 + i * 18;
        ctx.beginPath();
        for (let x = 0; x <= vw; x += 24) {
          const yy = y + Math.sin(x / 24 + i * 2) * 3;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(120,53,15,.35)';
      for (const p of d.pebbles) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // 月面环形山：椭圆坑 + 受光的上缘
      for (const c of d.craters) {
        ctx.fillStyle = 'rgba(30,41,59,.5)';
        ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r, c.r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(241,245,249,.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(c.x, c.y - 1.5, c.r, c.r * 0.38, 0, Math.PI, Math.PI * 2); ctx.stroke();
      }
    }
  },

  // 沙坑 / 水塘（世界坐标，随相机平移）
  drawHazards() {
    const { ctx } = this;
    const gy = this.groundY;
    if (this.bunker) {
      const z = this.bunker, cx = (z.x0 + z.x1) / 2, rw = (z.x1 - z.x0) / 2;
      ctx.fillStyle = '#e7cf9b';
      ctx.beginPath(); ctx.ellipse(cx, gy + 3, rw, 9, 0, 0, Math.PI * 2); ctx.fill();
      // 坑内阴影营造凹陷感
      ctx.fillStyle = 'rgba(146,110,55,.3)';
      ctx.beginPath(); ctx.ellipse(cx, gy + 5, rw * 0.82, 5.5, 0, 0, Math.PI); ctx.fill();
    }
    if (this.water) {
      const z = this.water, cx = (z.x0 + z.x1) / 2, rw = (z.x1 - z.x0) / 2;
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath(); ctx.ellipse(cx, gy + 3, rw, 8, 0, 0, Math.PI * 2); ctx.fill();
      // 游动的波光短线
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1.4;
      const ph = now() / 500;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const wx = z.x0 + ((ph * 16 + i * rw * 0.6) % (rw * 1.7)) + rw * 0.15;
        ctx.moveTo(wx - 5, gy + 1.5 + i * 2); ctx.lineTo(wx + 5, gy + 1.5 + i * 2);
      }
      ctx.stroke();
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
        this.drawHazards();
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
        this.drawHazards();
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
    this.buildDecos();         // 切皮肤重建专属装饰物
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
