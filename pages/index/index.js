Page({
  data: {
    gamePickerShow: false,
    // 小游戏合集：新增游戏只需在这里加一项
    games: [
      { icon: '🧊', name: '方块跳跳消', sub: '按压蓄力跳跃 · 堆叠消除', bg: '#f3ecff', url: '/packageGame/pages/block-jump/block-jump' },
      { icon: '⛳', name: '一杆进洞', sub: '滑动瞄准 · 蓄力击球 · 全服排行榜', bg: '#e8f7e6', url: '/packageGame/pages/golf/golf' },
      { icon: '🧩', name: '乾坤挪移', sub: '滑块复原图案 · 步数挑战 · 多图案关卡', bg: '#fff6e0', url: '/packageGame/pages/puzzle/puzzle' },
      { icon: '🎲', name: '魔方大师', sub: '3D真实还原 · 2~5阶 · 一键重置', bg: '#e0f2fe', url: '/packageGame/pages/cube/cube' }
    ]
  },

  // 进入「点单」模块（独立分包）
  goOrder() {
    wx.navigateTo({
      url: '/packageOrder/pages/menu/menu'
    });
  },

  // 进入「健身打卡」模块（独立分包）
  goFitness() {
    wx.navigateTo({
      url: '/packageFitness/pages/index/index'
    });
  },

  // 小游戏选择弹窗
  openGamePicker() { this.setData({ gamePickerShow: true }); },
  closeGamePicker() { this.setData({ gamePickerShow: false }); },
  goPlay(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    this.setData({ gamePickerShow: false });
    wx.navigateTo({ url });
  },

  // 进入「我的菜单」模块（独立分包），每个用户维护自己的专属菜单
  goAdmin() {
    wx.navigateTo({
      url: '/packageAdmin/pages/admin/admin'
    });
  },

  // 空处理器：阻断弹窗面板上的事件冒泡
  noop() {}
});
