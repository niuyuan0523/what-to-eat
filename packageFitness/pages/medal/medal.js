const fit = require('../../utils/fitness.js');

Page({
  data: {
    stats: {
      currentStreak: 0,
      bestStreak: 0,
      earnedCount: 0,
      medals: fit.MEDALS.map((m) => ({ days: m.days, name: m.name, icon: m.icon, desc: m.desc, earned: false }))
    }
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    wx.showLoading({ title: '加载中...' });
    fit.listRecords().then((records) => {
      wx.hideLoading();
      this.setData({ stats: fit.computeStats(records) });
    }).catch((err) => {
      wx.hideLoading();
      console.error('加载失败', err);
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    });
  }
});
