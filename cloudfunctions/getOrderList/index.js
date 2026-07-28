const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 查询订单列表 / 近一月点单量
// 订单由 sendOrderNotice 云函数写入（无 _openid 字段），小程序端直查会被
// 集合默认权限"仅创建者可读写"过滤成空，故统一走云函数查询
exports.main = async (event, context) => {
  const { action, ownerId } = event
  const wxContext = cloud.getWXContext()

  // 与 sendOrderNotice 的兜底逻辑保持一致：未传 ownerId 视为查自己名下的订单
  const owner = ownerId || wxContext.OPENID

  try {
    if (action === 'sales') {
      // 近一个月且未取消的订单（用于菜品点单量统计）
      const oneMonthAgo = new Date()
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

      const result = await db.collection('orders')
        .where({
          ownerId: owner,
          createTime: _.gte(oneMonthAgo),
          status: _.neq('cancelled')
        })
        .limit(100)
        .get()

      return { success: true, data: result.data }
    }

    // 默认：订单列表（最近 50 条）
    const result = await db.collection('orders')
      .where({ ownerId: owner })
      .orderBy('createTime', 'desc')
      .limit(50)
      .get()

    // 调试信息：实际查询用的 owner + 集合总记录数（区分"没写进去"和"ownerId 对不上"）
    let total = -1
    try {
      const cnt = await db.collection('orders').count()
      total = cnt.total
    } catch (e) { /* 集合不存在时保持 -1 */ }

    return { success: true, data: result.data, debug: { owner: owner, total: total } }
  } catch (err) {
    // 集合尚未创建（还没有任何订单）时返回空列表而非报错
    if (err.errCode === -502005) {
      return { success: true, data: [] }
    }
    console.error('订单列表查询失败:', err)
    return {
      success: false,
      message: err.message,
      errCode: err.errCode
    }
  }
}
