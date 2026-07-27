Page({
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

  // 进入「方块跳跳消」小游戏（独立分包）
  goGame() {
    wx.navigateTo({
      url: '/packageGame/pages/block-jump/block-jump'
    });
  },

  // 进入「我的菜单」模块（独立分包），每个用户维护自己的专属菜单
  goAdmin() {
    wx.navigateTo({
      url: '/packageAdmin/pages/admin/admin'
    });
  }
});
