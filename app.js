App({
  onLaunch() {
    // 初始化云开发环境
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-d3g57caju929b77a5', // 云环境 ID，请替换为您实际的云环境 ID
        traceUser: true
      });
      console.log('云开发初始化成功');
    } else {
      console.error('请使用 2.2.3 或以上的基础库');
    }
  }
})