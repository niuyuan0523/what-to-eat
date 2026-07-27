const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const COLLECTION = 'dish_comments'

// 菜品评论与虚拟打赏（爱心）
exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    switch (action) {
      case 'add':
        return await addComment(event, openid)

      case 'list':
        return await listComments(event)

      case 'stats':
        return await getStats(event)

      default:
        return { success: false, message: '未知操作类型' }
    }
  } catch (err) {
    console.error('云函数执行失败:', err)
    return { success: false, message: err.message }
  }
}

// 新增评论/打赏
async function addComment(event, openid) {
  const { ownerId, dishId, dishName, content, reward, authorName } = event

  if (!ownerId || !dishId) {
    return { success: false, message: '缺少菜单主人或菜品信息' }
  }

  const trimmedContent = (content || '').trim().substring(0, 200)
  const rewardCount = Math.max(0, Math.min(99, Number(reward) || 0))

  if (!trimmedContent && rewardCount === 0) {
    return { success: false, message: '评论和爱心不能都为空' }
  }

  const data = {
    ownerId: ownerId,
    dishId: dishId,
    dishName: dishName || '',
    content: trimmedContent,
    reward: rewardCount,
    authorName: (authorName || '家人').substring(0, 20),
    authorOpenid: openid,
    createTime: db.serverDate()
  }

  try {
    const result = await db.collection(COLLECTION).add({ data })
    return { success: true, message: '发表成功', data: result._id }
  } catch (err) {
    // 集合不存在时自动创建后重试
    if (err.errCode === -502005 || (err.message && err.message.includes('not exist'))) {
      await db.createCollection(COLLECTION)
      const result = await db.collection(COLLECTION).add({ data })
      return { success: true, message: '发表成功', data: result._id }
    }
    throw err
  }
}

// 查询某菜品的评论列表（时间倒序）
async function listComments(event) {
  const { ownerId, dishId } = event

  if (!ownerId || !dishId) {
    return { success: false, message: '缺少菜单主人或菜品信息' }
  }

  try {
    const res = await db.collection(COLLECTION)
      .where({ ownerId: ownerId, dishId: dishId })
      .orderBy('createTime', 'desc')
      .limit(50)
      .get()

    return { success: true, data: res.data }
  } catch (err) {
    if (err.errCode === -502005 || (err.message && err.message.includes('not exist'))) {
      return { success: true, data: [] }
    }
    throw err
  }
}

// 聚合某菜单下各菜品的累计爱心数与评论数
async function getStats(event) {
  const { ownerId } = event

  if (!ownerId) {
    return { success: false, message: '缺少菜单主人信息' }
  }

  try {
    const res = await db.collection(COLLECTION)
      .aggregate()
      .match({ ownerId: ownerId })
      .group({
        _id: '$dishId',
        totalReward: $.sum('$reward'),
        commentCount: $.sum(1)
      })
      .limit(500)
      .end()

    return { success: true, data: res.list }
  } catch (err) {
    if (err.errCode === -502005 || (err.message && err.message.includes('not exist'))) {
      return { success: true, data: [] }
    }
    throw err
  }
}
