const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const VALID_STATUS = ['pending', 'confirmed', 'preparing', 'completed', 'cancelled']

// 更新订单状态（订单记录由云函数写入、无 _openid，前端直改会被集合权限拦截）
// 权限规则：掌勺人（ownerId）可任意流转状态；下单人（buyerOpenId）仅可取消待处理订单
exports.main = async (event, context) => {
  const { orderNo, status } = event
  const openid = cloud.getWXContext().OPENID

  if (!orderNo || VALID_STATUS.indexOf(status) < 0) {
    return { success: false, message: '参数不合法' }
  }

  try {
    const res = await db.collection('orders')
      .where({ orderNo: orderNo })
      .limit(1)
      .get()

    if (res.data.length === 0) {
      return { success: false, message: '订单不存在' }
    }

    const order = res.data[0]
    const isOwner = order.ownerId === openid
    const isBuyer = order.buyerOpenId === openid
    const buyerCanCancel = isBuyer && status === 'cancelled' && order.status === 'pending'

    if (!isOwner && !buyerCanCancel) {
      return { success: false, message: '无权修改该订单状态' }
    }

    await db.collection('orders').doc(order._id).update({
      data: {
        status: status,
        updateTime: db.serverDate()
      }
    })

    return { success: true, message: '状态已更新', status: status }
  } catch (err) {
    console.error('更新订单状态失败:', err)
    return {
      success: false,
      message: err.message,
      errCode: err.errCode
    }
  }
}
