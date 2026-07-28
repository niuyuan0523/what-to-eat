const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 获取订单详情
exports.main = async (event, context) => {
  const { orderNo } = event
  
  console.log('获取订单详情，订单号:', orderNo)
  
  if (!orderNo) {
    return {
      success: false,
      message: '缺少订单号'
    }
  }
  
  try {
    // 查询订单详情
    const result = await db.collection('orders')
      .where({
        orderNo: orderNo
      })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get()
    
    if (result.data.length > 0) {
      console.log('订单查询成功', result.data[0])
      const order = result.data[0]
      const openid = cloud.getWXContext().OPENID
      return {
        success: true,
        data: order,
        // 身份标识：掌勺人可流转状态，下单人可取消待处理订单
        isOwner: order.ownerId === openid,
        isBuyer: order.buyerOpenId === openid,
        message: '查询成功'
      }
    } else {
      console.log('订单不存在')
      return {
        success: false,
        message: '订单不存在'
      }
    }
    
  } catch (err) {
    console.error('查询订单失败:', err)
    return {
      success: false,
      message: err.message,
      errCode: err.errCode
    }
  }
}
