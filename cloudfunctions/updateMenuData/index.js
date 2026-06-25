const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, docId, categories } = event
  
  console.log('收到请求:', action, docId)
  
  try {
    switch (action) {
      case 'update':
        return await updateData(docId, categories)
      
      case 'add':
        return await addData(categories)
      
      case 'get':
        return await getData()
      
      case 'delete':
        return await deleteData(docId)
      
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

// 更新数据
async function updateData(docId, categories) {
  if (!docId) {
    return {
      success: false,
      message: '缺少文档 ID'
    }
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

// 添加新文档
async function addData(categories) {
  const result = await db.collection('menu_config').add({
    data: {
      categories: categories,
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

// 获取数据
async function getData() {
  const result = await db.collection('menu_config').get()
  
  return {
    success: true,
    message: '获取成功',
    data: result.data
  }
}

// 删除文档
async function deleteData(docId) {
  const result = await db.collection('menu_config').doc(docId).remove()
  
  console.log('删除成功:', result)
  
  return {
    success: true,
    message: '删除成功',
    data: result
  }
}
