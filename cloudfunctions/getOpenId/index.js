const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  // 获取当前调用用户的 OpenID
  const wxContext = cloud.getWXContext()
  
  console.log('当前用户信息:', wxContext)
  
  return {
    success: true,
    openid: wxContext.OPENID,
    unionid: wxContext.UNIONID,
    appid: wxContext.APPID,
    message: '获取 OpenID 成功'
  }
}
