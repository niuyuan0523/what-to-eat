const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const COLLECTION = 'fitness_records'

// 确保集合存在（首次使用自动创建，降低手动配置成本）
async function ensureCollection() {
  try {
    await db.createCollection(COLLECTION)
  } catch (e) {
    // 集合已存在会抛错，忽略即可
  }
}

exports.main = async (event, context) => {
  const { action } = event
  const openid = cloud.getWXContext().OPENID

  try {
    await ensureCollection()

    // 新增一条打卡记录
    if (action === 'add') {
      const { date, type, typeName, duration, calories } = event
      const res = await db.collection(COLLECTION).add({
        data: {
          _openid: openid,
          date: date,               // 本地日期字符串 YYYY-MM-DD
          type: type,               // 运动类型 key
          typeName: typeName,       // 运动类型名称
          duration: Number(duration) || 0,   // 时长（分钟）
          calories: Number(calories) || 0,   // 估算卡路里
          createTime: db.serverDate()
        }
      })
      return { success: true, id: res._id }
    }

    // 拉取当前用户的全部打卡记录（用于统计 / 日历）
    if (action === 'list') {
      const res = await db.collection(COLLECTION)
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .limit(1000)
        .get()
      return { success: true, data: res.data, openid: openid }
    }

    // 删除一条打卡记录（仅本人）
    if (action === 'remove') {
      const { id } = event
      await db.collection(COLLECTION).doc(id).remove()
      return { success: true }
    }

    return { success: false, message: '未知的 action：' + action }
  } catch (err) {
    console.error('fitness 云函数执行失败', err)
    return { success: false, message: err.message, errCode: err.errCode }
  }
}
