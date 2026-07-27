const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 保存订单（不再发送订阅消息，点单后由用户把订单详情页分享给掌勺人）
exports.main = async (event, context) => {
  const { orderNo, ownerId } = event

  const wxContext = cloud.getWXContext()

  console.log('收到订单保存请求:', event)

  // 订单归属的菜单主人（掌勺人），未传时默认为下单人自己
  const menuOwnerId = ownerId || wxContext.OPENID

  const orderId = await saveOrderToDatabase(event, menuOwnerId, wxContext.OPENID)

  return {
    success: orderId !== null,
    message: orderId !== null ? '订单保存成功' : '订单保存失败',
    orderId: orderId,
    orderNo: orderNo
  }
}

// 保存订单到数据库
async function saveOrderToDatabase(orderData, ownerId, buyerOpenId) {
  const doc = {
    orderNo: orderData.orderNo,
    orderDetail: orderData.orderDetail,
    items: orderData.items || [], // 保存完整的菜品列表
    cartCount: orderData.cartCount,
    orderTime: orderData.orderTime,
    status: 'pending', // pending, confirmed, preparing, completed, cancelled
    createTime: db.serverDate(),
    ownerId: ownerId, // 订单归属的菜单主人
    buyerOpenId: buyerOpenId, // 下单人
    remark: orderData.remark || '' // 订单备注
  }

  try {
    const result = await db.collection('orders').add({ data: doc })
    console.log('订单保存成功:', result._id)
    return result._id
  } catch (err) {
    // 集合不存在时自动创建后重试
    if (err.errCode === -502005) {
      try {
        await db.createCollection('orders')
        const retry = await db.collection('orders').add({ data: doc })
        console.log('创建集合后订单保存成功:', retry._id)
        return retry._id
      } catch (retryErr) {
        console.error('创建集合后保存仍失败:', retryErr)
        return null
      }
    }
    console.error('订单保存失败:', err)
    return null
  }
}
