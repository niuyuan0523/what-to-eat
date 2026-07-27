const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const COLLECTION = 'golf_rank'

// 排行榜维度 → 数据库字段映射
const BOARD_FIELD = {
  total: 'total',        // 总积分榜
  combo: 'bestCombo',    // 连击榜
  luck: 'luck',          // 运气榜（蝴蝶助攻次数）
  rim: 'rim',            // 差一丢丢榜（停洞边次数）
  daily: 'dailyBest'     // 每日一洞榜
}

// 每日一洞理论分数区间：5 洞全 ace 满连击 = 100+120+150+180+210，全飞出屏 = -20×5
const DAILY_MAX = 760
const DAILY_MIN = -100

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// 确保集合存在（首次使用自动创建）；模块级缓存，温实例不再重复请求
let collectionReady = false
async function ensureCollection() {
  if (collectionReady) return
  try {
    await db.createCollection(COLLECTION)
  } catch (e) {
    // 集合已存在会抛错，忽略即可
  }
  collectionReady = true
}

// 客户端上报不可信：结合上一条记录 + 距上次同步的时长，把各字段增量收敛到合理区间
// prev 为 null 表示首次上报（可能积累了较久的本地离线数据），只做宽松的绝对上限
function sanitize(event, prev) {
  const inTotal = Number(event.total) || 0
  const inCombo = Number(event.bestCombo) || 0
  const inLuck = Number(event.luck) || 0
  const inRim = Number(event.rim) || 0
  const inHoles = Number(event.holes) || 0
  const inDailyBest = clamp(Number(event.dailyBest) || 0, DAILY_MIN, DAILY_MAX)

  if (!prev) {
    const holes = clamp(inHoles, 0, 50000)
    const bestCombo = clamp(inCombo, 0, Math.min(holes, 999))
    // 单洞得分上限 = 满连击 ace 的收益 120 + 30×combo
    const total = clamp(inTotal, -20 * holes, holes * (120 + 30 * bestCombo))
    return {
      total: total,
      bestCombo: bestCombo,
      luck: clamp(inLuck, 0, holes),
      rim: clamp(inRim, 0, holes),
      holes: holes,
      dailyBest: inDailyBest
    }
  }

  // 距上次同步的秒数：一洞至少 3 秒（击球+飞行+结算动画），留 10 洞余量容忍时钟误差
  const prevTime = prev.updateTime instanceof Date ? prev.updateTime.getTime() : 0
  const elapsedSec = Math.max(1, (Date.now() - prevTime) / 1000)
  const maxHolesDelta = Math.ceil(elapsedSec / 3) + 10

  const pTotal = Number(prev.total) || 0
  const pCombo = Number(prev.bestCombo) || 0
  const pLuck = Number(prev.luck) || 0
  const pRim = Number(prev.rim) || 0
  const pHoles = Number(prev.holes) || 0

  // holes/luck/rim/bestCombo 均单调不减；luck、rim 每洞至多 +1，连击每洞至多 +1
  const holesDelta = clamp(inHoles - pHoles, 0, maxHolesDelta)
  const holes = pHoles + holesDelta
  const bestCombo = clamp(inCombo, pCombo, Math.min(pCombo + holesDelta, 999))
  // 单洞最差 -20（飞出屏幕），最好为当前连击档位的 ace 收益
  const totalDelta = clamp(inTotal - pTotal, -20 * holesDelta, holesDelta * (120 + 30 * bestCombo))

  return {
    total: pTotal + totalDelta,
    bestCombo: bestCombo,
    luck: clamp(inLuck, pLuck, pLuck + holesDelta),
    rim: clamp(inRim, pRim, pRim + holesDelta),
    holes: holes,
    dailyBest: inDailyBest
  }
}

exports.main = async (event, context) => {
  const { action } = event
  const openid = cloud.getWXContext().OPENID

  try {
    await ensureCollection()

    // 上报个人战绩（每个 openid 一条记录，存在则更新）
    if (action === 'sync') {
      if (!openid) return { success: false, message: '无法获取用户身份' }

      const exist = await db.collection(COLLECTION).where({ openid: openid }).get()
      const prev = exist.data.length > 0 ? exist.data[0] : null
      const stats = sanitize(event, prev)
      const doc = {
        openid: openid,
        nickname: String(event.nickname || '').slice(0, 12),
        total: stats.total,
        bestCombo: stats.bestCombo,
        luck: stats.luck,
        rim: stats.rim,
        holes: stats.holes,
        dailyDate: String(event.dailyDate || ''),
        dailyBest: stats.dailyBest,
        updateTime: db.serverDate()
      }

      if (prev) {
        await db.collection(COLLECTION).doc(prev._id).update({ data: doc })
        // 清理历史并发写入产生的重复记录，保证每个 openid 只留一条
        for (let i = 1; i < exist.data.length; i++) {
          await db.collection(COLLECTION).doc(exist.data[i]._id).remove()
        }
      } else {
        // 以 openid 作为 _id：并发首次上报时第二次 add 会因主键冲突失败，改走更新，天然防重复
        try {
          await db.collection(COLLECTION).add({ data: Object.assign({ _id: openid }, doc) })
        } catch (e) {
          await db.collection(COLLECTION).doc(openid).update({ data: doc })
        }
      }
      return { success: true }
    }

    // 拉取榜单：Top 50 + 我的排名
    if (action === 'board') {
      const field = BOARD_FIELD[event.type]
      if (!field) return { success: false, message: '未知榜单类型：' + event.type }

      // 每日一洞榜只统计当天成绩（客户端传入本地日期，全服同一天）
      const where = event.type === 'daily'
        ? { dailyDate: String(event.date || ''), dailyBest: _.gt(-9999) }
        : { [field]: _.gt(0) }

      const top = await db.collection(COLLECTION)
        .where(where)
        .orderBy(field, 'desc')
        .orderBy('updateTime', 'asc')
        .limit(50)
        .field({ nickname: true, [field]: true, openid: true })
        .get()

      const list = top.data.map(d => ({
        nickname: d.nickname,
        value: d[field],
        me: d.openid === openid
      }))

      // 我的排名：比我分高的人数 + 1
      let myRank = 0, myValue = 0
      const mine = await db.collection(COLLECTION).where({ openid: openid }).get()
      if (mine.data.length > 0) {
        const me = mine.data[0]
        const inDaily = event.type !== 'daily' || me.dailyDate === String(event.date || '')
        myValue = me[field] || 0
        if (inDaily && (event.type === 'daily' || myValue > 0)) {
          const higherWhere = event.type === 'daily'
            ? { dailyDate: String(event.date || ''), dailyBest: _.gt(myValue) }
            : { [field]: _.gt(myValue) }
          const cnt = await db.collection(COLLECTION).where(higherWhere).count()
          myRank = cnt.total + 1
        }
      }

      return { success: true, list: list, myRank: myRank, myValue: myValue }
    }

    return { success: false, message: '未知的 action：' + action }
  } catch (err) {
    console.error('golf 云函数执行失败', err)
    return { success: false, message: err.message, errCode: err.errCode }
  }
}
