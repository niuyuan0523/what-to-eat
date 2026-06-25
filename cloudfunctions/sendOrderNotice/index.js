const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { 
    orderNo, 
    orderDetail, 
    totalPrice, 
    cartCount, 
    orderTime,
    items
  } = event
  
  // 在云函数中配置模板 ID（与前端解耦）
  const templateId = 'A-b9BSmusaUh6aYqHrVgd1vPu5z3gbqpgF_lb7o0A5o'
  
  console.log('收到订单通知请求:', event)
  console.log('模板 ID:', templateId)
  
  try {
    // 管理员的 OpenID（已配置）
    const adminOpenId = 'oEwpY3RaCOAXH-zVWnkgS5WgRlqI'
    
    console.log('管理员 OpenID:', adminOpenId)
    console.log('订单信息:', { orderNo, orderDetail, totalPrice, cartCount, orderTime })
    
    if (!adminOpenId || adminOpenId.length === 0) {
      console.error('管理员 OpenID 未配置')
      return {
        success: false,
        message: '请先配置管理员 OpenID'
      }
    }
    
    // 发送订阅消息
    const result = await cloud.openapi.subscribeMessage.send({
      touser: adminOpenId,
      templateId: templateId,
      page: `pages/order-detail/order-detail?orderNo=${orderNo}`, // 点击后跳转到订单详情页
      data: {
        // 根据您的模板字段配置：
        // 商品名称 {{thing18.DATA}} - 最多20个字符
        thing18: {
          value: orderDetail.substring(0, 20) // 商品名称（订单详情）
        },
        // 订单编号 {{character_string16.DATA}} - 数字、字母或下划线，最多32位
        character_string16: {
          value: orderNo // 订单编号
        },
        // 购买时间 {{time6.DATA}} - 时间格式
        time6: {
          value: orderTime // 购买时间
        },
        // 温馨提示 {{thing8.DATA}} - 最多20个字符
        thing8: {
          value: `共${cartCount}件商品，合计￥${totalPrice}` // 温馨提示
        }
      },
      miniprogramState: 'developer' // 开发版: developer, 体验版: trial, 正式版: formal
    })
    
    console.log('订阅消息发送成功:', result)
    
    // 保存订单到数据库（可选）
    await saveOrderToDatabase(event, adminOpenId)
    
    return {
      success: true,
      message: '订阅消息发送成功',
      data: result
    }
    
  } catch (err) {
    console.error('订阅消息发送失败:', err)
    return {
      success: false,
      message: err.message,
      errCode: err.errCode
    }
  }
}

// 保存订单到数据库
async function saveOrderToDatabase(orderData, adminOpenId) {
  try {
    // 解析商品列表（从 orderDetail 中提取或从 items 字段获取）
    const items = orderData.items || []
    
    const result = await db.collection('orders').add({
      data: {
        orderNo: orderData.orderNo,
        orderDetail: orderData.orderDetail,
        items: items, // 保存完整的商品列表
        totalPrice: orderData.totalPrice,
        cartCount: orderData.cartCount,
        orderTime: orderData.orderTime,
        status: 'pending', // pending, confirmed, preparing, completed, cancelled
        createTime: db.serverDate(),
        adminOpenId: adminOpenId,
        remark: orderData.remark || '' // 订单备注
      }
    })
    
    console.log('订单保存成功:', result._id)
    console.log('保存的商品数量:', items.length)
    return result._id
  } catch (err) {
    console.error('订单保存失败:', err)
    return null
  }
}
