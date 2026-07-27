// 独立分包：用户直接进入本分包时不会执行 app.js，需在此初始化云开发环境
if (wx.cloud) {
  wx.cloud.init({
    env: 'cloud1-d3g57caju929b77a5',
    traceUser: true
  });
}

Page({
  data: {
    docId: '',           // 数据库文档 ID
    openid: '',          // 当前用户 openid（用于图片上传路径）
    categories: [],      // 所有分类数据
    currentTab: 0,       // 当前选中的分类索引
    showEditModal: false, // 是否显示编辑弹窗
    editMode: 'add',     // 编辑模式：add 或 edit
    editType: 'goods',   // 编辑类型：goods 或 category
    formData: {},        // 表单数据
    uploading: false,    // 图片上传中
    loading: false
  },

  onLoad() {
    this.loadData()
  },

  // 加载自己的菜单（云函数按 openid 归属查询，不存在时自动创建默认菜单）
  loadData() {
    wx.showLoading({ title: '加载中...' })

    wx.cloud.callFunction({
      name: 'updateMenuData',
      data: {
        action: 'get'
      },
      success: res => {
        console.log('菜单加载成功', res)
        wx.hideLoading()
        const result = res.result || {}

        if (result.success && result.data && result.data.length > 0) {
          const doc = result.data[0]
          this.setData({
            docId: doc._id,
            openid: result.openid || '',
            categories: doc.categories || []
          })
        } else {
          wx.showToast({
            title: result.message || '加载失败',
            icon: 'error'
          })
        }
      },
      fail: err => {
        console.error('菜单加载失败', err)
        wx.hideLoading()
        wx.showModal({
          title: '加载失败',
          content: `请确认云函数 updateMenuData 已部署\n\n错误信息: ${err.errMsg}`,
          showCancel: false
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
      content: '确定要删除该分类及其所有菜品吗？',
      success: (res) => {
        if (res.confirm) {
          const categories = this.data.categories
          categories.splice(this.data.currentTab, 1)
          this.saveData(categories)
        }
      }
    })
  },

  // 添加菜品
  addGoods() {
    const categoryId = this.data.categories[this.data.currentTab].id
    this.setData({
      showEditModal: true,
      editMode: 'add',
      editType: 'goods',
      formData: {
        id: 'g_' + Date.now(),
        name: '',
        image: '',
        desc: '',
        categoryId: categoryId
      }
    })
  },

  // 编辑菜品
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

  // 删除菜品
  deleteGoods(e) {
    const goodsIndex = e.currentTarget.dataset.index
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该菜品吗？',
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

  // 拍照/相册选择菜品图片并上传到云存储
  chooseImage() {
    if (this.data.uploading) return

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.uploadImage(tempFilePath)
      },
      fail: (err) => {
        // 用户取消不提示
        if (err.errMsg && err.errMsg.includes('cancel')) return
        console.error('选择图片失败', err)
      }
    })
  },

  // 上传图片到云存储，将 fileID 写入表单
  uploadImage(tempFilePath) {
    this.setData({ uploading: true })
    wx.showLoading({ title: '上传中...' })

    const ext = tempFilePath.split('.').pop() || 'jpg'
    const cloudPath = `dish-images/${this.data.openid || 'anonymous'}/${Date.now()}.${ext}`

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath,
      success: (res) => {
        console.log('图片上传成功', res.fileID)
        const formData = this.data.formData
        formData.image = res.fileID
        this.setData({ formData })
        wx.showToast({ title: '上传成功', icon: 'success' })
      },
      fail: (err) => {
        console.error('图片上传失败', err)
        wx.showToast({ title: '上传失败，请重试', icon: 'none' })
      },
      complete: () => {
        this.setData({ uploading: false })
        wx.hideLoading()
      }
    })
  },

  // 移除已选图片
  removeImage() {
    const formData = this.data.formData
    formData.image = ''
    this.setData({ formData })
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
      if (!formData.name) {
        wx.showToast({ title: '请输入菜品名称', icon: 'error' })
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
      // 处理菜品
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

  // 保存数据到数据库（云函数会校验只能修改自己的菜单）
  saveData(categories) {
    wx.showLoading({ title: '保存中...' })
    
    console.log('开始保存数据，docId:', this.data.docId)
    console.log('保存的数据:', categories)
    
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
        wx.showModal({
          title: '保存失败',
          content: `请确认云函数 updateMenuData 已部署\n\n错误信息: ${err.errMsg}`,
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

  // 预览分享自己的菜单（进入点餐页）
  previewMenu() {
    wx.navigateTo({
      url: '/packageOrder/pages/menu/menu'
    })
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空函数，用于阻止事件冒泡
  }
})
