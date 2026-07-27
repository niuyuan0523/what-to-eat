// 独立分包：用户直接进入本分包时不会执行 app.js，需在此初始化云开发环境
if (wx.cloud) {
  wx.cloud.init({
    env: 'cloud1-d3g57caju929b77a5',
    traceUser: true
  });
}

Page({
  data: {
    // 导航栏
    activeNav: 0,           // 0: 点菜, 1: 订单
    statusBarHeight: 0,     // 状态栏高度
    navBarHeight: 44,       // 导航栏内容高度
    navTotalHeight: 0,      // 导航栏总高度(px)
    bottomHeight: 50,       // 底部高度(安全区域 + 结算栏)
    // 菜单归属
    ownerId: '',            // 当前菜单主人的 openid
    isOwner: true,          // 当前用户是否为菜单主人
    // 订单列表
    orderList: [],
    orderLoading: false,
    // 从云数据库获取数据（初始为空，在 onLoad 中加载）
    categories: [],
    currentTab: 0,        // 当前选中的分类索引
    toView: '',           // 右侧滚动到的锚点ID
    cartCount: 0,         // 购物车徽标数量
    showCart: false,      // 是否显示购物车弹窗
    cartItems: [],        // 购物车菜品列表
    categoryTops: [],     // 分类标题距离顶部的距离数组
    // 菜品评论/打赏弹窗
    showDishModal: false,
    currentDish: null,    // 当前查看的菜品
    comments: [],         // 当前菜品的评论列表
    commentLoading: false,
    commentText: '',      // 评论输入内容
    rewardCount: 0,       // 本次打赏的爱心数
    authorName: ''        // 评论人称呼
  },

  // 页面加载时从云数据库获取数据
  onLoad(options) {
    // 获取状态栏高度，计算导航栏总高度
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight;
    const navBarHeight = 44; // 导航栏内容高度
    const navTotalHeight = statusBarHeight + navBarHeight; // 导航栏总高度(px)
    
    // 计算底部安全区域高度
    const screenHeight = systemInfo.screenHeight;
    const safeAreaBottom = systemInfo.safeArea ? (screenHeight - systemInfo.safeArea.bottom) : 0;
    const bottomHeight = safeAreaBottom + 50; // 安全区域 + 底部结算栏(50px)
    
    this.setData({
      statusBarHeight: statusBarHeight,
      navBarHeight: navBarHeight,
      navTotalHeight: navTotalHeight,
      bottomHeight: bottomHeight,
      // 通过分享链接进入时携带菜单主人的 openid
      ownerId: options.ownerId || '',
      authorName: wx.getStorageSync('commentAuthorName') || ''
    });
    
    this.loadCategoriesFromCloud();
  },

  // 切换到订单列表时加载数据
  onShow() {
    if (this.data.activeNav === 1) {
      this.loadOrderList();
    }
  },

  // 分享菜单给家人：对方进入的是当前菜单主人的菜单
  onShareAppMessage() {
    return {
      title: '来我家菜单点个菜吧 🍽️',
      path: `/packageOrder/pages/menu/menu?ownerId=${this.data.ownerId}`
    };
  },

  // 切换顶部导航栏
  switchNav(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (index === this.data.activeNav) return;
    
    this.setData({ activeNav: index });
    
    if (index === 1) {
      this.loadOrderList();
    }
  },

  // 加载订单列表（仅当前菜单主人名下的订单）
  loadOrderList() {
    this.setData({ orderLoading: true });
    
    const db = wx.cloud.database();
    db.collection('orders')
      .where({ ownerId: this.data.ownerId })
      .orderBy('createTime', 'desc')
      .limit(50)
      .get({
        success: res => {
          console.log('订单列表查询成功', res);
          const statusMap = {
            'pending': '待处理',
            'confirmed': '已确认',
            'preparing': '制作中',
            'completed': '已完成',
            'cancelled': '已取消'
          };
          const orderList = res.data.map(item => ({
            ...item,
            statusText: statusMap[item.status] || '待处理'
          }));
          this.setData({
            orderList: orderList,
            orderLoading: false
          });
        },
        fail: err => {
          console.error('订单列表查询失败', err);
          // 尝试从本地缓存加载
          this.loadOrderListFromCache();
        }
      });
  },

  // 从本地缓存加载订单列表（备用方案）
  loadOrderListFromCache() {
    const cachedOrders = wx.getStorageSync('orderCache') || [];
    const statusMap = {
      'pending': '待处理',
      'confirmed': '已确认',
      'preparing': '制作中',
      'completed': '已完成',
      'cancelled': '已取消'
    };
    const orderList = cachedOrders.map((item, index) => ({
      ...item,
      _id: 'cache_' + index,
      statusText: statusMap[item.status] || '待处理'
    }));
    this.setData({
      orderList: orderList,
      orderLoading: false
    });
  },

  // 点击订单跳转到订单详情
  goToOrderDetail(e) {
    const orderNo = e.currentTarget.dataset.orderNo;
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/packageOrder/pages/order-detail/order-detail?orderNo=${orderNo}&id=${id}`
    });
  },

  // 通过云函数加载菜单数据（自己的菜单不存在时会自动创建默认菜单）
  loadCategoriesFromCloud() {
    wx.showLoading({
      title: '加载中...'
    });

    console.log('开始加载菜单数据，ownerId:', this.data.ownerId);

    wx.cloud.callFunction({
      name: 'updateMenuData',
      data: {
        action: 'get',
        ownerId: this.data.ownerId || undefined
      },
      success: res => {
        console.log('菜单查询成功', res);
        const result = res.result || {};

        if (result.success && result.data && result.data.length > 0) {
          const docData = result.data[0];
          const categories = docData.categories || [];

          this.setData({
            categories: categories,
            toView: categories.length > 0 ? categories[0].id : '',
            // 未携带 ownerId 时（打开自己的菜单），以文档归属为准
            ownerId: docData.ownerId || this.data.ownerId,
            isOwner: result.isOwner !== false
          });

          wx.hideLoading();

          // 加载近一个月的点单数据与评论统计
          this.loadSalesData();
          this.loadCommentStats();

          // 延迟更新分类位置
          setTimeout(() => {
            this.updateCategoryTops();
          }, 500);
        } else {
          wx.hideLoading();
          this.showLoadError(result.message || '菜单数据为空');
        }
      },
      fail: err => {
        console.error('菜单查询失败', err);
        wx.hideLoading();
        this.showLoadError('菜单加载失败', err.errCode);
      }
    });
  },

  // 加载失败提示（可重试）
  showLoadError(errorMsg, errCode) {
    wx.showModal({
      title: '加载失败',
      content: `${errorMsg}${errCode ? '\n错误码: ' + errCode : ''}`,
      confirmText: '重试',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          this.loadCategoriesFromCloud();
        } else {
          wx.navigateBack({
            fail: () => {
              wx.reLaunch({ url: '/pages/index/index' });
            }
          });
        }
      }
    });
  },

  // 加载近一个月的点单数据（仅统计当前菜单的订单）
  loadSalesData() {
    const db = wx.cloud.database();
    const _ = db.command;
    
    // 计算一个月前的时间
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    console.log('查询近一个月订单，起始时间:', oneMonthAgo);
    
    // 查询近一个月且未取消的订单
    db.collection('orders')
      .where({
        ownerId: this.data.ownerId,
        createTime: _.gte(oneMonthAgo),
        status: _.neq('cancelled')
      })
      .limit(100)
      .get({
        success: res => {
          console.log('点单量查询成功，订单数:', res.data.length);
          
          // 统计每个菜品被点次数
          const salesMap = {};
          res.data.forEach(order => {
            if (order.items && Array.isArray(order.items)) {
              order.items.forEach(item => {
                const id = item.id;
                if (!salesMap[id]) {
                  salesMap[id] = 0;
                }
                salesMap[id] += (item.cartCount || 1);
              });
            }
          });
          
          console.log('菜品点单统计:', salesMap);
          
          // 更新 categories 中的点单数据
          const categories = this.data.categories.map(cate => ({
            ...cate,
            goodsList: cate.goodsList.map(goods => ({
              ...goods,
              sales: salesMap[goods.id] || 0
            }))
          }));
          
          this.setData({ categories });
          
          // 更新分类位置
          setTimeout(() => {
            this.updateCategoryTops();
          }, 300);
        },
        fail: err => {
          console.error('点单量查询失败', err);
          // 查询失败不影响正常使用
        }
      });
  },

  // 加载各菜品的累计爱心数与评论数
  loadCommentStats() {
    wx.cloud.callFunction({
      name: 'dishComment',
      data: {
        action: 'stats',
        ownerId: this.data.ownerId
      },
      success: res => {
        const result = res.result || {};
        if (!result.success || !Array.isArray(result.data)) return;

        // _id 为 dishId
        const statsMap = {};
        result.data.forEach(item => {
          statsMap[item._id] = {
            totalReward: item.totalReward || 0,
            commentCount: item.commentCount || 0
          };
        });

        const categories = this.data.categories.map(cate => ({
          ...cate,
          goodsList: cate.goodsList.map(goods => ({
            ...goods,
            totalReward: (statsMap[goods.id] && statsMap[goods.id].totalReward) || 0,
            commentCount: (statsMap[goods.id] && statsMap[goods.id].commentCount) || 0
          }))
        }));

        this.setData({ categories });
      },
      fail: err => {
        console.error('评论统计查询失败', err);
        // 查询失败不影响正常使用
      }
    });
  },

  // ============ 菜品评论 / 打赏 ============

  // 点击菜品卡片，打开评论弹窗
  openDishModal(e) {
    const goodsId = e.currentTarget.dataset.id;
    let currentDish = null;

    this.data.categories.forEach(cate => {
      cate.goodsList.forEach(goods => {
        if (goods.id === goodsId) {
          currentDish = goods;
        }
      });
    });

    if (!currentDish) return;

    this.setData({
      showDishModal: true,
      currentDish: currentDish,
      comments: [],
      commentText: '',
      rewardCount: 0
    });

    this.loadComments(goodsId);
  },

  // 关闭评论弹窗
  hideDishModal() {
    this.setData({
      showDishModal: false,
      currentDish: null
    });
  },

  // 加载当前菜品的评论列表
  loadComments(dishId) {
    this.setData({ commentLoading: true });

    wx.cloud.callFunction({
      name: 'dishComment',
      data: {
        action: 'list',
        ownerId: this.data.ownerId,
        dishId: dishId
      },
      success: res => {
        const result = res.result || {};
        const comments = (result.data || []).map(item => ({
          ...item,
          timeText: this.formatCommentTime(item.createTime)
        }));
        this.setData({
          comments: comments,
          commentLoading: false
        });
      },
      fail: err => {
        console.error('评论加载失败', err);
        this.setData({ commentLoading: false });
      }
    });
  },

  // 格式化评论时间
  formatCommentTime(createTime) {
    if (!createTime) return '';
    const date = new Date(createTime);
    if (isNaN(date.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  // 评论输入
  onCommentInput(e) {
    this.setData({ commentText: e.detail });
  },

  // 称呼输入
  onAuthorNameInput(e) {
    this.setData({ authorName: e.detail });
  },

  // 爱心数量变化
  onRewardChange(e) {
    this.setData({ rewardCount: Number(e.detail) || 0 });
  },

  // 提交评论 + 打赏
  submitComment() {
    const { currentDish, commentText, rewardCount, authorName, ownerId } = this.data;
    if (!currentDish) return;

    if (!commentText.trim() && rewardCount === 0) {
      wx.showToast({ title: '写点评价或送个爱心吧', icon: 'none' });
      return;
    }

    // 记住称呼，下次自动带上
    if (authorName.trim()) {
      wx.setStorageSync('commentAuthorName', authorName.trim());
    }

    wx.showLoading({ title: '提交中...' });

    wx.cloud.callFunction({
      name: 'dishComment',
      data: {
        action: 'add',
        ownerId: ownerId,
        dishId: currentDish.id,
        dishName: currentDish.name,
        content: commentText.trim(),
        reward: rewardCount,
        authorName: authorName.trim() || '家人'
      },
      success: res => {
        wx.hideLoading();
        const result = res.result || {};
        if (result.success) {
          wx.showToast({
            title: rewardCount > 0 ? `已送出 ${rewardCount} 颗爱心` : '点评成功',
            icon: 'success'
          });
          this.setData({ commentText: '', rewardCount: 0 });
          // 刷新评论列表与累计统计
          this.loadComments(currentDish.id);
          this.loadCommentStats();
        } else {
          wx.showToast({ title: result.message || '提交失败', icon: 'none' });
        }
      },
      fail: err => {
        console.error('评论提交失败', err);
        wx.hideLoading();
        wx.showToast({ title: '提交失败，请重试', icon: 'none' });
      }
    });
  },

  // ============ 分类 / 滚动 ============

  // 点击左侧分类，右侧联动跳转
  switchCategory(e) {
    const index = e.currentTarget.dataset.index;
    const id = e.currentTarget.dataset.id;
    this.setData({
      currentTab: index,
      toView: id
    });
  },

  // 监听右侧菜品列表滚动
  onGoodsScroll(e) {
    const scrollTop = e.detail.scrollTop;
    const categoryTops = this.data.categoryTops;
    
    // 如果 categoryTops 为空，先计算
    if (categoryTops.length === 0) {
      this.updateCategoryTops();
      return;
    }
    
    // 找到当前滚动到的分类
    let currentIndex = 0;
    for (let i = categoryTops.length - 1; i >= 0; i--) {
      if (scrollTop >= categoryTops[i] - 100) { // 100rpx 的偏移量
        currentIndex = i;
        break;
      }
    }
    
    // 如果分类索引变化，更新左侧高亮
    if (currentIndex !== this.data.currentTab) {
      this.setData({
        currentTab: currentIndex
      });
    }
  },

  // 更新分类标题距离顶部的距离
  updateCategoryTops() {
    const query = wx.createSelectorQuery();
    const categories = this.data.categories;
    
    // 查询所有分类标题的位置
    categories.forEach((cate, index) => {
      query.select(`#${cate.id}`).boundingClientRect();
    });
    
    query.exec((res) => {
      const tops = res.map(item => item && item.top).filter(top => top !== undefined);
      this.setData({
        categoryTops: tops
      });
    });
  },

  // ============ 购物车 ============

  // 菜品 Stepper 数值变化事件（菜品列表页）
  onGoodsStepperChange(e) {
    const goodsId = e.currentTarget.dataset.id;
    const newValue = e.detail;
    const categories = this.data.categories;
    let totalCartCount = 0;
    
    for (let i = 0; i < categories.length; i++) {
      for (let j = 0; j < categories[i].goodsList.length; j++) {
        if (categories[i].goodsList[j].id === goodsId) {
          categories[i].goodsList[j].cartCount = newValue;
        }
        totalCartCount += categories[i].goodsList[j].cartCount || 0;
      }
    }
    
    this.setData({
      categories: categories,
      cartCount: totalCartCount
    });
    
    this.updateCartItems();
  },

  // 显示购物车弹窗
  showCartModal() {
    if (this.data.cartCount > 0) {
      this.updateCartItems();
      this.setData({
        showCart: true
      });
    }
  },

  // 隐藏购物车弹窗
  hideCartModal() {
    this.setData({
      showCart: false
    });
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空函数，阻止点击事件冒泡到遮罩层
  },

  // 更新购物车菜品列表
  updateCartItems() {
    const categories = this.data.categories;
    const cartItems = [];
    
    // 遍历所有分类，收集cartCount > 0的菜品
    for (let i = 0; i < categories.length; i++) {
      for (let j = 0; j < categories[i].goodsList.length; j++) {
        const goods = categories[i].goodsList[j];
        if (goods.cartCount && goods.cartCount > 0) {
          cartItems.push({
            id: goods.id,
            name: goods.name,
            image: goods.image,
            cartCount: goods.cartCount
          });
        }
      }
    }
    
    this.setData({
      cartItems: cartItems
    });
  },

  // 购物车弹窗内 Stepper 数值变化事件
  onStepperChange(e) {
    const goodsId = e.currentTarget.dataset.id;
    const newValue = e.detail;
    const categories = this.data.categories;
    let totalCartCount = 0;
    
    for (let i = 0; i < categories.length; i++) {
      for (let j = 0; j < categories[i].goodsList.length; j++) {
        if (categories[i].goodsList[j].id === goodsId) {
          categories[i].goodsList[j].cartCount = newValue;
        }
        totalCartCount += categories[i].goodsList[j].cartCount || 0;
      }
    }
    
    this.setData({
      categories: categories,
      cartCount: totalCartCount
    });
    
    this.updateCartItems();
  },

  // 清空购物车
  clearCart() {
    const categories = this.data.categories;
    
    // 将所有菜品的cartCount重置为0
    for (let i = 0; i < categories.length; i++) {
      for (let j = 0; j < categories[i].goodsList.length; j++) {
        categories[i].goodsList[j].cartCount = 0;
      }
    }
    
    this.setData({
      categories: categories,
      cartCount: 0,
      cartItems: [],
      showCart: false
    });
  },

  // ============ 下单 ============

  // 生成订单号
  generateOrderNo() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}${random}`;
  },

  // 获取订单菜品摘要（用于订阅消息，最多20个字符）
  getOrderDetail() {
    const cartItems = this.data.cartItems;
    
    if (cartItems.length === 1) {
      // 只有一道菜，显示菜名和数量
      const item = cartItems[0];
      return `${item.name} x${item.cartCount}`.substring(0, 20);
    } else if (cartItems.length > 1) {
      // 多道菜，显示第一道菜名 + “等X道菜”
      const firstName = cartItems[0].name;
      const summary = `${firstName}等${cartItems.length}道菜`;
      return summary.substring(0, 20);
    }
    
    return '';
  },

  // 获取完整的订单详情（用于日志和数据库保存）
  getFullOrderDetail() {
    const cartItems = this.data.cartItems;
    let detail = '';
    cartItems.forEach((item, index) => {
      detail += `${item.name} x${item.cartCount}`;
      if (index < cartItems.length - 1) {
        detail += '\n';
      }
    });
    return detail;
  },

  // 提交点餐
  onCheckout() {
    if (this.data.cartCount === 0) {
      return;
    }
    
    wx.showModal({
      title: '确认点餐',
      content: `共 ${this.data.cartCount} 道菜，确认提交给掌勺人？`,
      success: (res) => {
        if (res.confirm) {
          this.submitOrder();
        }
      }
    });
  },

  // 提交订单并保存到云数据库
  submitOrder() {
    const orderNo = this.generateOrderNo();
    const productName = this.getOrderDetail(); // 简短菜品名称（用于订单列表预览）
    const fullOrderDetail = this.getFullOrderDetail(); // 完整订单详情（用于日志）
    const cartCount = this.data.cartCount;
    
    console.log('订单信息:', { orderNo, productName, fullOrderDetail, cartCount });
    
    // 保存订单（不再发送订阅消息，提交后引导用户把订单页分享给掌勺人）
    this.sendOrderNotice(orderNo, productName, cartCount);
  },

  // 保存订单到云数据库（通过云函数）
  sendOrderNotice(orderNo, orderDetail, cartCount) {
    wx.showLoading({ title: '提交中...' });
    
    // 获取当前时间（格式：YYYY-MM-DD HH:mm:ss）
    const now = new Date();
    const orderTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    // 获取购物车中的菜品列表（包含完整信息）
    const items = this.data.cartItems.map(item => ({
      id: item.id,
      name: item.name,
      cartCount: item.cartCount,
      image: item.image || ''
    }));
    
    console.log('订单时间:', orderTime);
    console.log('菜品列表:', items);
    
    // 调用云函数保存订单
    wx.cloud.callFunction({
      name: 'sendOrderNotice',
      data: {
        orderNo: orderNo,
        orderDetail: orderDetail,
        items: items, // 传递完整的菜品列表
        cartCount: cartCount,
        orderTime: orderTime,
        ownerId: this.data.ownerId // 订单归属的菜单主人
      },
      success: res => {
        console.log('订单保存成功:', res);
        wx.hideLoading();
        this.orderSubmitSuccess(orderNo, orderTime, items);
      },
      fail: err => {
        console.error('订单保存失败:', err);
        wx.hideLoading();
        // 即使保存失败，也先缓存到本地，不阻断流程
        this.orderSubmitSuccess(orderNo, orderTime, items);
      }
    });
  },

  // 订单提交成功：引导跳转订单详情页，把点单信息分享给掌勺人
  orderSubmitSuccess(orderNo, orderTime, items) {
    // 保存订单信息到本地缓存（用于离线查看订单详情）
    this.saveOrderToCache(orderNo, orderTime, items);
    // 清空购物车
    this.clearCart();

    // 跳转到订单详情页，在详情页内分享给掌勺人
    wx.showModal({
      title: '点单成功 🎉',
      content: '去订单页把菜单分享给掌勺人，提醒TA开火吧~',
      confirmText: '去分享',
      cancelText: '继续逗留',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({
            url: `/packageOrder/pages/order-detail/order-detail?orderNo=${orderNo}&share=1`
          });
        } else {
          wx.showToast({
            title: '订单已提交',
            icon: 'success',
            duration: 2000
          });
        }
      }
    });
  },

  // 保存订单信息到本地缓存
  saveOrderToCache(orderNo, orderTime, items) {
    const orderData = {
      orderNo: orderNo,
      orderDetail: this.getFullOrderDetail(),
      items: items,
      cartCount: this.data.cartCount,
      orderTime: orderTime,
      ownerId: this.data.ownerId,
      status: 'pending'
    };
    
    // 获取缓存的订单列表
    const cachedOrders = wx.getStorageSync('orderCache') || [];
    // 添加新订单
    cachedOrders.unshift(orderData);
    // 只保留最近50个订单
    if (cachedOrders.length > 50) {
      cachedOrders.length = 50;
    }
    // 保存缓存
    wx.setStorageSync('orderCache', cachedOrders);
    console.log('订单已保存到缓存', orderData);
  },

  // 页面加载完成后计算分类位置
  onReady() {
    setTimeout(() => {
      this.updateCategoryTops();
    }, 500); // 延迟 500ms 确保 DOM 已渲染完成
  }
});
