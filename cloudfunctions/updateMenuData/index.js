const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 历史全局菜单归属人：早期版本 menu_config 只有一份全局文档（无 ownerId），
// 首次访问时由原管理员认领该文档，其他用户从默认模板开始
const LEGACY_ADMIN_OPENID = 'oEwpY3RaCOAXH-zVWnkgS5WgRlqI'

// 新用户的默认菜单模板（家庭常吃菜示例，用户可在「我的菜单」中自由修改）
function getDefaultCategories() {
  return [
    {
      id: 'cate_hot',
      name: '家常热菜',
      goodsList: [
        { id: 'g_default_01', name: '番茄炒蛋', image: '', desc: '酸甜下饭，全家都爱的国民家常菜。' },
        { id: 'g_default_02', name: '红烧排骨', image: '', desc: '色泽红亮，软烂脱骨，招牌硬菜。' },
        { id: 'g_default_03', name: '清炒时蔬', image: '', desc: '当季绿叶菜清炒，清爽解腻。' }
      ]
    },
    {
      id: 'cate_soup',
      name: '汤羹',
      goodsList: [
        { id: 'g_default_11', name: '紫菜蛋花汤', image: '', desc: '简单快手，饭前来一碗暖胃。' },
        { id: 'g_default_12', name: '玉米排骨汤', image: '', desc: '清甜不腻，慢炖出好味道。' }
      ]
    },
    {
      id: 'cate_staple',
      name: '主食',
      goodsList: [
        { id: 'g_default_21', name: '白米饭', image: '', desc: '一碗热腾腾的米饭，百搭主食。' },
        { id: 'g_default_22', name: '手擀面', image: '', desc: '筋道爽滑，配什么浇头都好吃。' }
      ]
    }
  ]
}

exports.main = async (event, context) => {
  const { action, docId, categories, ownerId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  console.log('收到请求:', action, 'openid:', openid, 'ownerId:', ownerId)

  try {
    switch (action) {
      case 'update':
        return await updateData(openid, docId, categories)

      case 'add':
        return await addData(openid, categories)

      case 'get':
        return await getData(openid, ownerId)

      case 'delete':
        return await deleteData(openid, docId)

      default:
        return {
          success: false,
          message: '未知操作类型'
        }
    }
  } catch (err) {
    console.error('云函数执行失败:', err)
    return {
      success: false,
      message: err.message
    }
  }
}

// 校验文档归属：只能操作自己的菜单
async function checkOwner(openid, docId) {
  const doc = await db.collection('menu_config').doc(docId).get()
  if (!doc.data) {
    return { ok: false, message: '菜单不存在' }
  }
  if (doc.data.ownerId !== openid) {
    return { ok: false, message: '无权操作他人菜单' }
  }
  return { ok: true }
}

// 更新数据（仅限自己的菜单）
async function updateData(openid, docId, categories) {
  if (!docId) {
    return {
      success: false,
      message: '缺少文档 ID'
    }
  }

  const check = await checkOwner(openid, docId)
  if (!check.ok) {
    return { success: false, message: check.message }
  }

  const result = await db.collection('menu_config').doc(docId).update({
    data: {
      categories: categories,
      updateTime: db.serverDate()
    }
  })

  console.log('更新成功:', result)

  return {
    success: true,
    message: '更新成功',
    data: result
  }
}

// 为当前用户新建菜单文档
async function addData(openid, categories) {
  const result = await db.collection('menu_config').add({
    data: {
      ownerId: openid,
      categories: categories || getDefaultCategories(),
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })

  console.log('添加成功:', result)

  return {
    success: true,
    message: '添加成功',
    data: result._id
  }
}

// 获取菜单：
// - 传 ownerId 时查看指定用户的菜单（分享场景）
// - 不传时查自己的菜单，不存在则认领旧全局文档或用默认模板自动创建
async function getData(openid, ownerId) {
  const targetOwnerId = ownerId || openid
  const isOwner = targetOwnerId === openid

  let res = await db.collection('menu_config')
    .where({ ownerId: targetOwnerId })
    .limit(1)
    .get()

  // 查看他人菜单但对方还没有菜单
  if (res.data.length === 0 && !isOwner) {
    return {
      success: false,
      message: '对方还没有创建菜单',
      openid: openid,
      isOwner: false
    }
  }

  // 自己的菜单不存在：认领旧全局文档 或 初始化默认菜单
  if (res.data.length === 0 && isOwner) {
    const created = await initOwnMenu(openid)
    res = { data: [created] }
  }

  return {
    success: true,
    message: '获取成功',
    data: res.data,
    openid: openid,
    isOwner: isOwner
  }
}

// 初始化自己的菜单：原管理员认领无 ownerId 的旧文档，其他用户创建默认菜单
async function initOwnMenu(openid) {
  const _ = db.command

  if (openid === LEGACY_ADMIN_OPENID) {
    const legacy = await db.collection('menu_config')
      .where({ ownerId: _.exists(false) })
      .limit(1)
      .get()

    if (legacy.data.length > 0) {
      const legacyDoc = legacy.data[0]
      await db.collection('menu_config').doc(legacyDoc._id).update({
        data: {
          ownerId: openid,
          updateTime: db.serverDate()
        }
      })
      console.log('旧全局菜单已认领:', legacyDoc._id)
      return { ...legacyDoc, ownerId: openid }
    }
  }

  const categories = getDefaultCategories()
  const addRes = await db.collection('menu_config').add({
    data: {
      ownerId: openid,
      categories: categories,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  console.log('默认菜单已创建:', addRes._id)
  return {
    _id: addRes._id,
    ownerId: openid,
    categories: categories
  }
}

// 删除文档（仅限自己的菜单）
async function deleteData(openid, docId) {
  if (!docId) {
    return { success: false, message: '缺少文档 ID' }
  }

  const check = await checkOwner(openid, docId)
  if (!check.ok) {
    return { success: false, message: check.message }
  }

  const result = await db.collection('menu_config').doc(docId).remove()

  console.log('删除成功:', result)

  return {
    success: true,
    message: '删除成功',
    data: result
  }
}
