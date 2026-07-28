// 独立分包：用户直接进入本分包时不会执行 app.js，需在此初始化云开发环境
if (wx.cloud) {
  wx.cloud.init({
    env: 'cloud1-d3g57caju929b77a5',
    traceUser: true
  });
}

const db = wx.cloud.database()

Page({
  data: {
    orderNo: '',
    orderDetail: null,
    loading: true,
    orderStatus: '',
    showShareTip: false,
    // 身份与可执行操作（由 getOrderDetail 云函数返回）
    isOwner: false,
    isBuyer: false,
    statusActions: []      // 掌勺人可用的状态流转按钮
  },

  onLoad(options) {
    console.log('订单详情页面加载，参数:', options)
    
    const orderNo = options.orderNo || ''
    this.setData({ 
      orderNo,
      // 刚下完单跳转过来时，提示用户点右上角/分享按钮发给掌勺人
      showShareTip: options.share === '1'
    })
    
    if (orderNo) {
      this.loadOrderDetail(orderNo)
    } else {
      wx.showToast({
        title: '订单号不存在',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 2000)
    }
  },

  // 加载订单详情
  loadOrderDetail(orderNo) {
    wx.showLoading({ title: '加载中...' })
    
    // 调用云函数获取订单详情
    wx.cloud.callFunction({
      name: 'getOrderDetail',
      data: {
        orderNo: orderNo
      },
      success: res => {
        console.log('获取订单详情成功', res)
        wx.hideLoading()
        
        if (res.result && res.result.success) {
          const order = res.result.data
          this.setData({
            orderDetail: order,
            loading: false,
            orderStatus: this.getStatusText(order.status),
            isOwner: res.result.isOwner === true,
            isBuyer: res.result.isBuyer === true,
            statusActions: this.getStatusActions(order.status, res.result.isOwner === true)
          })
        } else {
          // 云端查不到（如刚下单尚未同步），回退到本地缓存
          this.loadFromLocalCache(orderNo)
        }
      },
      fail: err => {
        console.error('获取订单详情失败', err)
        wx.hideLoading()
        this.setData({ loading: false })
        
        // 云函数调用失败，显示本地缓存的数据（如果有）
        this.loadFromLocalCache(orderNo)
      }
    })
  },

  // 从本地缓存加载订单信息（备用方案）
  loadFromLocalCache(orderNo) {
    const cachedOrders = wx.getStorageSync('orderCache') || []
    const order = cachedOrders.find(item => item.orderNo === orderNo)
    
    if (order) {
      this.setData({
        orderDetail: order,
        loading: false,
        orderStatus: '已提交'
      })
    } else {
      wx.showModal({
        title: '订单不存在',
        content: '该订单信息尚未同步，请稍后重试',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
    }
  },

  // 获取订单状态文本
  getStatusText(status) {
    const statusMap = {
      'pending': '待处理',
      'confirmed': '已确认',
      'preparing': '制作中',
      'completed': '已完成',
      'cancelled': '已取消'
    }
    return statusMap[status] || '待处理'
  },

  // 掌勺人可执行的状态流转（按做菜流程推进，随时可取消）
  getStatusActions(status, isOwner) {
    if (!isOwner) return []
    const flow = {
      'pending':   [{ status: 'confirmed', label: '接单', type: 'primary' }],
      'confirmed': [{ status: 'preparing', label: '开始制作', type: 'primary' }],
      'preparing': [{ status: 'completed', label: '出餐完成', type: 'primary' }]
    }
    const actions = flow[status] || []
    if (status !== 'completed' && status !== 'cancelled') {
      actions.push({ status: 'cancelled', label: '取消订单', type: 'default' })
    }
    return actions
  },

  // 掌勺人点击状态流转按钮
  onStatusAction(e) {
    const { status, label } = e.currentTarget.dataset
    wx.showModal({
      title: '确认操作',
      content: `确定要「${label}」吗？`,
      success: (res) => {
        if (res.confirm) this.updateOrderStatus(status)
      }
    })
  },

  // 下单人取消待处理订单
  onBuyerCancel() {
    wx.showModal({
      title: '取消订单',
      content: '确定不点了吗？',
      success: (res) => {
        if (res.confirm) this.updateOrderStatus('cancelled')
      }
    })
  },

  // 调云函数更新状态并刷新页面（订单记录无 _openid，前端直改会被权限拦截）
  updateOrderStatus(status) {
    wx.showLoading({ title: '更新中...' })
    wx.cloud.callFunction({
      name: 'updateOrderStatus',
      data: { orderNo: this.data.orderNo, status: status },
      success: res => {
        wx.hideLoading()
        if (res.result && res.result.success) {
          wx.showToast({ title: '已更新', icon: 'success' })
          this.loadOrderDetail(this.data.orderNo)
        } else {
          wx.showToast({ title: (res.result && res.result.message) || '更新失败', icon: 'none' })
        }
      },
      fail: err => {
        console.error('更新订单状态失败', err)
        wx.hideLoading()
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      }
    })
  },

  // 刷新订单
  refreshOrder() {
    if (this.data.orderNo) {
      this.loadOrderDetail(this.data.orderNo)
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 跳转到首页
  goHome() {
    wx.reLaunch({
      url: '/pages/index/index'
    });
  },

  // 分享订单给掌勺人
  onShareAppMessage() {
    const { orderNo, orderDetail } = this.data
    const cartCount = orderDetail ? orderDetail.cartCount : ''
    return {
      title: cartCount ? `点好啦！共${cartCount}道菜，请掌勺人开火 🍳` : `点好啦！请掌勺人开火 🍳`,
      path: `/packageOrder/pages/order-detail/order-detail?orderNo=${orderNo}`
    }
  }
})
