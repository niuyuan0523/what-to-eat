const fit = require('../../utils/fitness.js');

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

Page({
  data: {
    todayLabel: '',
    stats: { currentStreak: 0, totalCount: 0, totalCalories: 0, earnedCount: 0 },
    todayRecords: [],
    earnedMedals: [],
    checkedToday: false,
    // 打卡面板
    showPanel: false,
    typeList: fit.EXERCISE_TYPES,
    durationPresets: [15, 30, 45, 60],
    selectedType: fit.EXERCISE_TYPES[0].key,
    duration: 30,
    estCalories: 0,
    submitting: false,
    records: []
  },

  onLoad() {
    const now = new Date();
    this.setData({
      todayLabel: (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + WEEK[now.getDay()]
    });
  },

  onShow() {
    this.loadData();
  },

  // 加载并统计打卡数据
  loadData() {
    wx.showLoading({ title: '加载中...' });
    fit.listRecords().then((records) => {
      wx.hideLoading();
      this.applyRecords(records);
    }).catch((err) => {
      wx.hideLoading();
      console.error('加载打卡记录失败', err);
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    });
  },

  applyRecords(records) {
    const stats = fit.computeStats(records);
    const today = fit.todayStr();

    const todayRecords = records
      .filter((r) => r.date === today)
      .map((r) => {
        let timeLabel = '';
        if (r.createTime) {
          const d = new Date(r.createTime);
          if (!isNaN(d.getTime())) {
            timeLabel = pad(d.getHours()) + ':' + pad(d.getMinutes());
          }
        }
        return {
          _id: r._id,
          typeName: r.typeName || fit.typeName(r.type),
          icon: fit.typeIcon(r.type),
          duration: r.duration,
          calories: r.calories,
          timeLabel: timeLabel
        };
      });

    this.setData({
      records: records,
      stats: stats,
      earnedMedals: stats.medals.filter((m) => m.earned),
      todayRecords: todayRecords,
      checkedToday: todayRecords.length > 0
    });
  },

  // ===== 打卡面板 =====
  openPanel() {
    this.setData({
      showPanel: true,
      selectedType: this.data.selectedType || fit.EXERCISE_TYPES[0].key,
      duration: this.data.duration || 30
    });
    this.refreshEst();
  },

  closePanel() {
    this.setData({ showPanel: false });
  },

  noop() {},

  selectType(e) {
    this.setData({ selectedType: e.currentTarget.dataset.key }, () => this.refreshEst());
  },

  setDuration(e) {
    this.setData({ duration: Number(e.currentTarget.dataset.val) }, () => this.refreshEst());
  },

  incDuration() {
    this.setData({ duration: Math.min(600, this.data.duration + 5) }, () => this.refreshEst());
  },

  decDuration() {
    this.setData({ duration: Math.max(5, this.data.duration - 5) }, () => this.refreshEst());
  },

  refreshEst() {
    this.setData({
      estCalories: fit.calcCalories(this.data.selectedType, this.data.duration)
    });
  },

  confirmCheckin() {
    if (this.data.submitting) return;
    const type = this.data.selectedType;
    const duration = this.data.duration;
    if (!duration || duration <= 0) {
      wx.showToast({ title: '请填写运动时长', icon: 'none' });
      return;
    }

    const record = {
      date: fit.todayStr(),
      type: type,
      typeName: fit.typeName(type),
      duration: duration,
      calories: fit.calcCalories(type, duration)
    };

    this.setData({ submitting: true });
    const prevBest = this.data.stats.bestStreak || 0;

    fit.addRecord(record).then(() => {
      this.setData({ submitting: false, showPanel: false });
      wx.showToast({ title: '打卡成功', icon: 'success' });
      // 重新加载并检测是否解锁新勋章
      fit.listRecords().then((records) => {
        this.applyRecords(records);
        const newStats = fit.computeStats(records);
        this.checkNewMedal(prevBest, newStats.bestStreak);
      });
    }).catch((err) => {
      this.setData({ submitting: false });
      console.error('打卡失败', err);
      wx.showToast({ title: (err && err.message) || '打卡失败', icon: 'none' });
    });
  },

  // 检测新解锁勋章并弹窗祝贺
  checkNewMedal(prevBest, newBest) {
    if (newBest <= prevBest) return;
    const unlocked = fit.MEDALS.filter((m) => m.days > prevBest && m.days <= newBest);
    if (unlocked.length === 0) return;
    const m = unlocked[unlocked.length - 1];
    setTimeout(() => {
      wx.showModal({
        title: m.icon + ' 恭喜解锁勋章',
        content: '「' + m.name + '」' + m.desc + '，继续保持！',
        confirmText: '去看看',
        cancelText: '好的',
        success: (res) => {
          if (res.confirm) this.goMedal();
        }
      });
    }, 800);
  },

  // ===== 跳转 =====
  goCalendar() {
    wx.navigateTo({ url: '/packageFitness/pages/calendar/calendar' });
  },

  goMedal() {
    wx.navigateTo({ url: '/packageFitness/pages/medal/medal' });
  },

  // ===== 生成并分享成果海报 =====
  sharePoster() {
    if (this.data.stats.totalCount === 0) {
      wx.showToast({ title: '先打一次卡再来分享吧', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '生成中...' });
    this.drawPoster().then((tempFilePath) => {
      wx.hideLoading();
      wx.previewImage({
        urls: [tempFilePath],
        current: tempFilePath
      });
    }).catch((err) => {
      wx.hideLoading();
      console.error('生成海报失败', err);
      wx.showToast({ title: '生成失败', icon: 'none' });
    });
  },

  drawPoster() {
    const stats = this.data.stats;
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery();
      query.select('#poster').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error('canvas 未就绪'));
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = (wx.getSystemInfoSync().pixelRatio) || 2;
        const W = 300;
        const H = 420;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);

        // 背景渐变
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#ff8a5c');
        grad.addColorStop(1, '#ff6a3d');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // 白色卡片
        ctx.fillStyle = '#ffffff';
        this.roundRect(ctx, 24, 90, W - 48, H - 140, 18);
        ctx.fill();

        // 标题
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText('我的健身打卡', W / 2, 52);

        // 大数字：连续天数
        ctx.fillStyle = '#ff6a3d';
        ctx.font = 'bold 64px sans-serif';
        ctx.fillText(String(stats.currentStreak), W / 2, 190);
        ctx.fillStyle = '#888888';
        ctx.font = '15px sans-serif';
        ctx.fillText('连续打卡（天）', W / 2, 218);

        // 三项统计
        const items = [
          { num: stats.totalCount, label: '累计次数' },
          { num: stats.totalDays, label: '打卡天数' },
          { num: stats.totalCalories, label: '累计千卡' }
        ];
        const baseY = 300;
        const colW = (W - 48) / 3;
        items.forEach((it, i) => {
          const cx = 24 + colW * i + colW / 2;
          ctx.fillStyle = '#333333';
          ctx.font = 'bold 24px sans-serif';
          ctx.fillText(String(it.num), cx, baseY);
          ctx.fillStyle = '#999999';
          ctx.font = '13px sans-serif';
          ctx.fillText(it.label, cx, baseY + 24);
        });

        // 底部标语
        ctx.fillStyle = '#bbbbbb';
        ctx.font = '13px sans-serif';
        ctx.fillText('坚持运动 · 遇见更好的自己', W / 2, 358);
        ctx.fillStyle = '#ffffff';
        ctx.font = '13px sans-serif';
        ctx.fillText(fit.todayStr(), W / 2, H - 20);

        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvas: canvas,
            success: (r) => resolve(r.tempFilePath),
            fail: reject
          });
        }, 60);
      });
    });
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  // 分享给微信好友
  onShareAppMessage() {
    const s = this.data.stats;
    return {
      title: '我已连续打卡 ' + s.currentStreak + ' 天，累计运动 ' + s.totalCount + ' 次，一起来健身吧！',
      path: '/packageFitness/pages/index/index'
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    const s = this.data.stats;
    return {
      title: '我已连续打卡 ' + s.currentStreak + ' 天，一起来健身吧！'
    };
  }
});
