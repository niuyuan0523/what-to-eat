// 管理员 OpenID 白名单：仅名单内的用户可见「后台管理」入口
// 如需新增管理员，将其 openid 追加到数组中（可在后台“获取管理员 OpenID”或 getOpenId 云函数获取）
const ADMIN_OPENIDS = ['oEwpY3RaCOAXH-zVWnkgS5WgRlqI'];

Page({
  data: {
    isAdmin: false
  },

  onLoad() {
    this.checkAdmin();
  },

  // 校验当前用户是否为管理员，命中白名单才显示后台入口
  checkAdmin() {
    if (!wx.cloud) return;
    wx.cloud.callFunction({
      name: 'getOpenId',
      success: res => {
        const openid = res && res.result && res.result.openid;
        if (openid && ADMIN_OPENIDS.indexOf(openid) !== -1) {
          this.setData({ isAdmin: true });
        }
      },
      fail: err => {
        console.error('获取 OpenID 失败', err);
      }
    });
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

  // 进入「后台管理」模块（独立分包）
  goAdmin() {
    wx.navigateTo({
      url: '/packageAdmin/pages/admin/admin'
    });
  }
});
