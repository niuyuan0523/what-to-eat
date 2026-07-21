// 独立分包：用户直接进入本分包时不会执行 app.js，需在此初始化云开发环境
if (wx.cloud) {
  wx.cloud.init({
    env: 'cloud1-d3g57caju929b77a5',
    traceUser: true
  });
}

const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    docId: '',           // 数据库文档 ID
    categories: [],      // 所有分类数据
    currentTab: 0,       // 当前选中的分类索引
    showEditModal: false, // 是否显示编辑弹窗
    editMode: 'add',     // 编辑模式：add 或 edit
    editType: 'goods',   // 编辑类型：goods 或 category
    formData: {},        // 表单数据
    loading: false
  },

  onLoad() {
    this.loadData()
  },

  // 加载数据（使用云函数获取，确保权限正确）
  loadData() {
    wx.showLoading({ title: '加载中...' })
    
    // 优先使用云函数获取数据
    wx.cloud.callFunction({
      name: 'updateMenuData',
      data: {
        action: 'get'
      },
      success: res => {
        console.log('云函数加载成功', res)
        if (res.result && res.result.success && res.result.data && res.result.data.length > 0) {
          const doc = res.result.data[0]
          this.setData({
            docId: doc._id,
            categories: doc.categories || []
          })
          wx.hideLoading()
        } else {
          // 云函数无数据，尝试直接查询
          this.loadDataDirect()
        }
      },
      fail: err => {
        console.log('云函数调用失败，使用直接查询', err)
        // 云函数调用失败，回退到直接查询
        this.loadDataDirect()
      }
    })
  },

  // 直接查询数据库（备用方案）
  loadDataDirect() {
    db.collection('menu_config').get({
      success: res => {
        console.log('直接查询成功', res)
        if (res.data && res.data.length > 0) {
          const doc = res.data[0]
          this.setData({
            docId: doc._id,
            categories: doc.categories || []
          })
        }
        wx.hideLoading()
      },
      fail: err => {
        console.error('加载失败', err)
        wx.hideLoading()
        wx.showToast({
          title: '加载失败',
          icon: 'error'
        })
      }
    })
  },

  // 切换分类
  switchCategory(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      currentTab: index
    })
  },

  // 添加分类
  addCategory() {
    this.setData({
      showEditModal: true,
      editMode: 'add',
      editType: 'category',
      formData: {
        id: 'cate_' + Date.now(),
        name: '',
        goodsList: []
      }
    })
  },

  // 编辑分类
  editCategory() {
    const category = this.data.categories[this.data.currentTab]
    this.setData({
      showEditModal: true,
      editMode: 'edit',
      editType: 'category',
      formData: { ...category }
    })
  },

  // 删除分类
  deleteCategory() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该分类及其所有商品吗？',
      success: (res) => {
        if (res.confirm) {
          const categories = this.data.categories
          categories.splice(this.data.currentTab, 1)
          this.saveData(categories)
        }
      }
    })
  },

  // 添加商品
  addGoods() {
    const categoryId = this.data.categories[this.data.currentTab].id
    this.setData({
      showEditModal: true,
      editMode: 'add',
      editType: 'goods',
      formData: {
        id: 'g_' + Date.now(),
        name: '',
        price: 0,
        originalPrice: 0,
        sales: 0,
        image: '',
        desc: '',
        categoryId: categoryId
      }
    })
  },

  // 编辑商品
  editGoods(e) {
    const goodsIndex = e.currentTarget.dataset.index
    const category = this.data.categories[this.data.currentTab]
    const goods = category.goodsList[goodsIndex]
    
    this.setData({
      showEditModal: true,
      editMode: 'edit',
      editType: 'goods',
      formData: { ...goods, categoryId: category.id },
      goodsIndex: goodsIndex
    })
  },

  // 删除商品
  deleteGoods(e) {
    const goodsIndex = e.currentTarget.dataset.index
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该商品吗？',
      success: (res) => {
        if (res.confirm) {
          const categories = this.data.categories
          const categoryIndex = this.data.currentTab
          categories[categoryIndex].goodsList.splice(goodsIndex, 1)
          this.saveData(categories)
        }
      }
    })
  },

  // Vant Field 输入变化事件
  onFieldChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail;
    const formData = this.data.formData;
    formData[field] = value;
    this.setData({ formData });
  },
  
  // 表单输入变化（保留兼容）
  onFormInputChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const formData = this.data.formData;
    formData[field] = value;
    this.setData({ formData });
  },

  // 保存表单
  saveForm() {
    const { formData, editMode, editType, categories, currentTab } = this.data
    
    // 验证必填字段
    if (editType === 'category') {
      if (!formData.name) {
        wx.showToast({ title: '请输入分类名称', icon: 'error' })
        return
      }
    } else {
      if (!formData.name || !formData.price) {
        wx.showToast({ title: '请填写完整信息', icon: 'error' })
        return
      }
    }
    
    wx.showLoading({ title: '保存中...' })
    
    if (editType === 'category') {
      // 处理分类
      if (editMode === 'add') {
        categories.push(formData)
      } else {
        categories[currentTab] = formData
      }
    } else {
      // 处理商品
      const categoryIndex = categories.findIndex(c => c.id === formData.categoryId)
      if (categoryIndex !== -1) {
        if (editMode === 'add') {
          categories[categoryIndex].goodsList.push(formData)
        } else {
          categories[categoryIndex].goodsList[this.data.goodsIndex] = formData
        }
      }
    }
    
    this.saveData(categories)
  },

  // 保存数据到数据库（使用云函数，绕过权限限制）
  saveData(categories) {
    wx.showLoading({ title: '保存中...' })
    
    console.log('开始保存数据，docId:', this.data.docId)
    console.log('保存的数据:', categories)
    
    // 使用云函数保存数据
    wx.cloud.callFunction({
      name: 'updateMenuData',
      data: {
        action: 'update',
        docId: this.data.docId,
        categories: categories
      },
      success: res => {
        console.log('云函数保存成功', res)
        wx.hideLoading()
        
        if (res.result && res.result.success) {
          this.closeModal()
          this.setData({ categories })
          wx.showToast({
            title: '保存成功',
            icon: 'success'
          })
          
          // 重新加载数据，确保同步
          setTimeout(() => {
            this.loadData()
          }, 1000)
        } else {
          wx.showToast({
            title: res.result?.message || '保存失败',
            icon: 'error'
          })
        }
      },
      fail: err => {
        console.error('云函数调用失败', err)
        wx.hideLoading()
        
        // 云函数失败，尝试直接更新
        this.saveDataDirect(categories)
      }
    })
  },

  // 直接更新数据库（备用方案）
  saveDataDirect(categories) {
    wx.showLoading({ title: '保存中...' })
    
    db.collection('menu_config').doc(this.data.docId).update({
      data: {
        categories: categories
      },
      success: res => {
        console.log('直接保存成功', res)
        wx.hideLoading()
        this.closeModal()
        this.setData({ categories })
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
        
        // 重新加载数据
        setTimeout(() => {
          this.loadData()
        }, 1000)
      },
      fail: err => {
        console.error('保存失败', err)
        wx.hideLoading()
        wx.showModal({
          title: '保存失败',
          content: `错误信息: ${err.errMsg}\n\n请检查:\n1. 数据库权限设置\n2. 云函数是否已部署\n3. 是否为数据创建者`,
          showCancel: false
        })
      }
    })
  },

  // 关闭弹窗
  closeModal() {
    this.setData({
      showEditModal: false,
      formData: {}
    })
  },

  // 导出数据
  exportData() {
    const data = JSON.stringify(this.data.categories, null, 2)
    
    wx.setClipboardData({
      data: data,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        })
      }
    })
  },

  // 导入数据
  importData() {
    wx.showModal({
      title: '导入数据',
      content: '请粘贴 JSON 格式的数据',
      editable: true,
      placeholderText: '[{"id":"cate_01","name":"分类","goodsList":[]}]',
      success: (res) => {
        if (res.confirm && res.content) {
          try {
            const categories = JSON.parse(res.content)
            wx.showLoading({ title: '导入中...' })
            
            this.saveData(categories)
          } catch (e) {
            wx.showToast({
              title: 'JSON 格式错误',
              icon: 'error'
            })
          }
        }
      }
    })
  },

  // 获取管理员 OpenID
  getAdminOpenId() {
    wx.showLoading({ title: '获取中...' })
    
    wx.cloud.callFunction({
      name: 'getOpenId',
      success: res => {
        console.log('获取 OpenID 成功', res)
        wx.hideLoading()
        
        if (res.result && res.result.success) {
          const openid = res.result.openid
          
          wx.showModal({
            title: '管理员 OpenID',
            content: openid,
            confirmText: '复制',
            showCancel: true,
            cancelText: '关闭',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.setClipboardData({
                  data: openid,
                  success: () => {
                    wx.showToast({
                      title: '已复制到剪贴板',
                      icon: 'success'
                    })
                  }
                })
              }
            }
          })
        } else {
          wx.showToast({
            title: '获取失败',
            icon: 'error'
          })
        }
      },
      fail: err => {
        console.error('获取 OpenID 失败', err)
        wx.hideLoading()
        wx.showModal({
          title: '获取失败',
          content: `请确认云函数 getOpenId 已部署\n\n错误信息: ${err.errMsg}`,
          showCancel: false
        })
      }
    })
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空函数，用于阻止事件冒泡
  }
})
