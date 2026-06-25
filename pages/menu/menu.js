Page({
  data: {
    // 导航栏
    activeNav: 0,           // 0: 点菜, 1: 订单
    statusBarHeight: 0,     // 状态栏高度
    navBarHeight: 44,       // 导航栏内容高度
    navTotalHeight: 0,      // 导航栏总高度(px)
    bottomHeight: 50,       // 底部高度(安全区域 + 结算栏)
    // 订单列表
    orderList: [],
    orderLoading: false,
    // 1. 从云数据库获取数据（初始为空，在 onLoad 中加载）
    categories: [],
    currentTab: 0,        // 当前选中的分类索引
    toView: '',    // 右侧滚动到的锚点ID
    cartCount: 0,         // 购物车徽标数量
    showCart: false,      // 是否显示购物车弹窗
    cartItems: [],        // 购物车商品列表
    totalPrice: 0,        // 购物车总价
    categoryTops: [],      // 分类标题距离顶部的距离数组
    adminClickCount: 0,   // 管理员入口点击计数
    lastClickTime: 0,     // 上次点击时间
    adminClickTimer: null // 计时器
  },

  // 页面加载时从云数据库获取数据
  onLoad() {
    // 获取状态栏高度，计算导航栏总高度
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight;
    const navBarHeight = 44; // 导航栏内容高度
    const navTotalHeight = statusBarHeight + navBarHeight; // 导航栏总高度(px)
    
    // 计算底部安全区域高度
    const screenHeight = systemInfo.screenHeight;
    const safeAreaBottom = systemInfo.safeArea ? (screenHeight - systemInfo.safeArea.bottom) : 0;
    const bottomHeight = safeAreaBottom + 50; // 安全区域 + van-submit-bar(50px)
    
    this.setData({
      statusBarHeight: statusBarHeight,
      navBarHeight: navBarHeight,
      navTotalHeight: navTotalHeight,
      bottomHeight: bottomHeight
    });
    
    this.loadCategoriesFromCloud();
  },

  // 切换到订单列表时加载数据
  onShow() {
    if (this.data.activeNav === 1) {
      this.loadOrderList();
    }
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

  // 加载订单列表（从云数据库获取）
  loadOrderList() {
    this.setData({ orderLoading: true });
    
    const db = wx.cloud.database();
    db.collection('orders')
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
      url: `/pages/order-detail/order-detail?orderNo=${orderNo}&id=${id}`
    });
  },

  // 从云开发数据库加载分类数据
  loadCategoriesFromCloud() {
    wx.showLoading({
      title: '加载中...'
    });

    console.log('开始从云数据库加载数据...');

    // 使用云数据库获取数据
    const db = wx.cloud.database();
    const _ = db.command;
    const menuCollection = db.collection('menu_config');

    menuCollection.get({
      success: res => {
        console.log('数据库查询成功', res);
        
        if (res.data && res.data.length > 0) {
          // 获取第一条文档的数据
          const docData = res.data[0];
          const categories = docData.categories || [];
          
          console.log('获取到分类数据', categories);
          
          this.setData({
            categories: categories,
            toView: categories.length > 0 ? categories[0].id : ''
          });

          wx.hideLoading();

          // 加载近一个月的销量数据
          this.loadSalesData();
          
          // 延迟更新分类位置
          setTimeout(() => {
            this.updateCategoryTops();
          }, 500);
        } else {
          console.warn('数据库中没有数据');
          wx.hideLoading();
          this.showErrorAndOfferFallback('数据库中没有数据');
        }
      },
      fail: err => {
        console.error('数据库查询失败', err);
        console.error('错误码:', err.errCode);
        console.error('错误信息:', err.errMsg);
        
        wx.hideLoading();
        this.showErrorAndOfferFallback('数据库查询失败', err.errCode);
      }
    });
  },

  // 显示错误并提供备用方案
  showErrorAndOfferFallback(errorMsg, errCode) {
    wx.showModal({
      title: '加载失败',
      content: `${errorMsg}\n${errCode ? '错误码: ' + errCode : ''}\n\n请检查：\n1. 云环境 ID 是否正确\n2. 云开发是否已开通\n3. 数据库集合是否已创建`,
      confirmText: '使用本地数据',
      cancelText: '重试',
      success: (res) => {
        if (res.confirm) {
          // 使用本地备用数据
          this.loadLocalData();
        } else if (res.cancel) {
          // 重试
          this.loadCategoriesFromCloud();
        }
      }
    });
  },

  // 加载近一个月的销量数据
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
        createTime: _.gte(oneMonthAgo),
        status: _.neq('cancelled')
      })
      .limit(100)
      .get({
        success: res => {
          console.log('销量查询成功，订单数:', res.data.length);
          
          // 统计每个商品的销量
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
          
          console.log('商品销量统计:', salesMap);
          
          // 更新 categories 中的销量数据
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
          console.error('销量查询失败', err);
          // 查询失败不影响正常使用，保持原有销量
        }
      });
  },

  // 加载本地备用数据
  loadLocalData() {
    console.log('使用本地备用数据');
    
    const localData = [
      {
        "id": "cate_01",
        "name": "热销好物",
        "goodsList": [
          { "id": "g_01", "name": "招牌珍珠奶茶", "price": 16, "originalPrice": 18, "sales": 520, "image": "https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=200", "desc": "经典红茶底配上Q弹现煮珍珠，醇香浓郁。" },
          { "id": "g_02", "name": "多肉葡萄冰沙", "price": 22, "originalPrice": 22, "sales": 340, "image": "https://images.unsplash.com/photo-1536935338788-846bb9981813?w=200", "desc": "满杯手剥新鲜葡萄果肉，搭配清爽绿茶冰沙。" },
          { "id": "g_03", "name": "杨枝甘露", "price": 20, "originalPrice": 24, "sales": 610, "image": "https://images.unsplash.com/photo-1546173159-315724a31696?w=200", "desc": "浓郁芒果肉混合清爽西柚粒，椰奶香气十足。" }
        ]
      },
      {
        "id": "cate_02",
        "name": "现磨咖啡",
        "goodsList": [
          { "id": "g_11", "name": "生椰拿铁", "price": 18, "originalPrice": 24, "sales": 888, "image": "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=200", "desc": "冷榨生椰乳碰撞高品质浓缩咖啡，椰香四溢。" },
          { "id": "g_12", "name": "美式咖啡", "price": 12, "originalPrice": 15, "sales": 150, "image": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200", "desc": "经典意式浓缩加入纯净水，口感纯粹提神。" }
        ]
      }
    ];

    this.setData({
      categories: localData,
      toView: localData.length > 0 ? localData[0].id : ''
    });

    wx.showToast({
      title: '已使用本地数据',
      icon: 'success',
      duration: 2000
    });

    // 加载近一个月的销量数据
    this.loadSalesData();

    // 延迟更新分类位置
    setTimeout(() => {
      this.updateCategoryTops();
    }, 500);
  },

  // 点击左侧分类，右侧联动跳转
  switchCategory(e) {
    const index = e.currentTarget.dataset.index;
    const id = e.currentTarget.dataset.id;
    this.setData({
      currentTab: index,
      toView: id
    });
  },

  // 监听右侧商品列表滚动
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
      const tops = res.map(item => item.top);
      this.setData({
        categoryTops: tops
      });
    });
  },

  // 添加到购物车
  addToCart(e) {
    const goodsId = e.currentTarget.dataset.id;
    const categories = this.data.categories;
    let totalCartCount = 0;
    
    // 遍历所有分类和商品，找到对应商品并增加数量
    for (let i = 0; i < categories.length; i++) {
      for (let j = 0; j < categories[i].goodsList.length; j++) {
        if (categories[i].goodsList[j].id === goodsId) {
          if (!categories[i].goodsList[j].cartCount) {
            categories[i].goodsList[j].cartCount = 0;
          }
          categories[i].goodsList[j].cartCount++;
        }
        // 计算总购物车数量
        totalCartCount += categories[i].goodsList[j].cartCount || 0;
      }
    }
    
    this.setData({
      categories: categories,
      cartCount: totalCartCount
    });
    
    this.updateCartItems();
  },

  // 从购物车减少
  removeFromCart(e) {
    const goodsId = e.currentTarget.dataset.id;
    const categories = this.data.categories;
    let totalCartCount = 0;
    
    // 遍历所有分类和商品，找到对应商品并减少数量
    for (let i = 0; i < categories.length; i++) {
      for (let j = 0; j < categories[i].goodsList.length; j++) {
        if (categories[i].goodsList[j].id === goodsId) {
          if (categories[i].goodsList[j].cartCount > 0) {
            categories[i].goodsList[j].cartCount--;
          }
        }
        // 计算总购物车数量
        totalCartCount += categories[i].goodsList[j].cartCount || 0;
      }
    }
    
    this.setData({
      categories: categories,
      cartCount: totalCartCount
    });
    
    this.updateCartItems();
  },

  // 商品 Stepper 数值变化事件（商品列表页）
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

  // 更新购物车商品列表
  updateCartItems() {
    const categories = this.data.categories;
    const cartItems = [];
    let totalPrice = 0;
    
    // 遍历所有分类，收集cartCount > 0的商品
    for (let i = 0; i < categories.length; i++) {
      for (let j = 0; j < categories[i].goodsList.length; j++) {
        const goods = categories[i].goodsList[j];
        if (goods.cartCount && goods.cartCount > 0) {
          cartItems.push({
            id: goods.id,
            name: goods.name,
            price: goods.price,
            image: goods.image,
            cartCount: goods.cartCount
          });
          totalPrice += goods.price * goods.cartCount;
        }
      }
    }
    
    this.setData({
      cartItems: cartItems,
      totalPrice: totalPrice
    });
  },

  // 在弹窗中添加到购物车
  addToCartInModal(e) {
    const goodsId = e.currentTarget.dataset.id;
    const categories = this.data.categories;
    let totalCartCount = 0;
    
    for (let i = 0; i < categories.length; i++) {
      for (let j = 0; j < categories[i].goodsList.length; j++) {
        if (categories[i].goodsList[j].id === goodsId) {
          categories[i].goodsList[j].cartCount++;
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

  // 在弹窗中从购物车减少
  removeFromCartInModal(e) {
    const goodsId = e.currentTarget.dataset.id;
    const categories = this.data.categories;
    let totalCartCount = 0;
    
    for (let i = 0; i < categories.length; i++) {
      for (let j = 0; j < categories[i].goodsList.length; j++) {
        if (categories[i].goodsList[j].id === goodsId) {
          if (categories[i].goodsList[j].cartCount > 0) {
            categories[i].goodsList[j].cartCount--;
          }
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

  // Stepper 数值变化事件
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
    
    // 将所有商品的cartCount重置为0
    for (let i = 0; i < categories.length; i++) {
      for (let j = 0; j < categories[i].goodsList.length; j++) {
        categories[i].goodsList[j].cartCount = 0;
      }
    }
    
    this.setData({
      categories: categories,
      cartCount: 0,
      cartItems: [],
      totalPrice: 0,
      showCart: false
    });
    
    wx.showToast({
      title: '购物车已清空',
      icon: 'success',
      duration: 1500
    });
  },

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

  // 获取订单商品详情摘要（用于订阅消息，最多20个字符）
  getOrderDetail() {
    const cartItems = this.data.cartItems;
    
    if (cartItems.length === 1) {
      // 只有一个商品，显示商品名称和数量
      const item = cartItems[0];
      return `${item.name} x${item.cartCount}`.substring(0, 20);
    } else if (cartItems.length > 1) {
      // 多个商品，显示第一个商品名称 + “等X件商品”
      const firstName = cartItems[0].name;
      const summary = `${firstName}等${cartItems.length}件商品`;
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

  // 结算
  onCheckout() {
    if (this.data.cartCount === 0) {
      return;
    }
    
    wx.showModal({
      title: '确认订单',
      content: `共 ${this.data.cartCount} 件商品，合计 ￥${this.data.totalPrice.toFixed(2)}`,
      success: (res) => {
        if (res.confirm) {
          this.submitOrder();
        }
      }
    });
  },

  // 提交订单并发送订单通知
  submitOrder() {
    const orderNo = this.generateOrderNo();
    const productName = this.getOrderDetail(); // 简短商品名称（用于订阅消息，最多20字符）
    const fullOrderDetail = this.getFullOrderDetail(); // 完整订单详情（用于日志）
    const totalPrice = this.data.totalPrice.toFixed(2);
    const cartCount = this.data.cartCount;
    
    console.log('订单信息:', { orderNo, productName, fullOrderDetail, totalPrice, cartCount });
    
    // 直接发送订单通知（不再请求用户授权订阅）
    this.sendOrderNotice(orderNo, productName, totalPrice, cartCount);
  },

  // 发送订单通知给管理员（通过云函数）
  sendOrderNotice(orderNo, orderDetail, totalPrice, cartCount) {
    wx.showLoading({ title: '提交中...' });
    
    // 获取当前时间（格式：YYYY-MM-DD HH:mm:ss）
    const now = new Date();
    const orderTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    // 获取购物车中的商品列表（包含完整信息）
    const items = this.data.cartItems.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      cartCount: item.cartCount,
      image: item.image || '',
      spec: item.spec || '常规规格'
    }));
    
    console.log('订单时间:', orderTime);
    console.log('商品列表:', items);
    
    // 调用云函数发送订阅消息
    wx.cloud.callFunction({
      name: 'sendOrderNotice',
      data: {
        orderNo: orderNo,
        orderDetail: orderDetail,
        items: items, // 传递完整的商品列表
        totalPrice: totalPrice,
        cartCount: cartCount,
        orderTime: orderTime
        // templateId 在云函数中配置
      },
      success: res => {
        console.log('订阅消息发送成功:', res);
        wx.hideLoading();
        this.orderSubmitSuccess();
      },
      fail: err => {
        console.error('订阅消息发送失败:', err);
        wx.hideLoading();
        // 即使发送失败，订单仍然提交成功
        this.orderSubmitSuccess();
      }
    });
  },

  // 订单提交成功处理
  orderSubmitSuccess() {
    wx.showToast({
      title: '订单已提交',
      icon: 'success',
      duration: 2000
    });
    // 保存订单信息到本地缓存（用于离线查看订单详情）
    this.saveOrderToCache();
    // 清空购物车
    this.clearCart();
  },

  // 保存订单信息到本地缓存
  saveOrderToCache() {
    const orderNo = this.generateOrderNo();
    const orderDetail = this.getFullOrderDetail();
    const items = this.data.cartItems.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      cartCount: item.cartCount,
      image: item.image,
      spec: item.spec || '常规规格'
    }));
    
    const now = new Date();
    const orderTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const orderData = {
      orderNo: orderNo,
      orderDetail: orderDetail,
      items: items,
      totalPrice: this.data.totalPrice.toFixed(2),
      cartCount: this.data.cartCount,
      orderTime: orderTime,
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
  },

  // 隐藏的管理员入口：连续点击分类标题 5 次进入管理后台
  onCategoryTitleTap(e) {
    const currentTime = Date.now();
    const { adminClickCount, lastClickTime, adminClickTimer } = this.data;
    
    console.log('点击分类标题，当前计数:', adminClickCount);
    
    // 清除之前的计时器
    if (adminClickTimer) {
      clearTimeout(adminClickTimer);
    }
    
    // 如果两次点击间隔超过 2 秒，重置计数
    if (lastClickTime > 0 && (currentTime - lastClickTime) > 2000) {
      console.log('间隔超过2秒，重置计数');
      this.setData({
        adminClickCount: 1,
        lastClickTime: currentTime
      });
      return;
    }
    
    const newCount = adminClickCount + 1;
    console.log('新的计数:', newCount);
  
    // 达到 5 次点击，进入管理后台
    if (newCount >= 10) {
      console.log('达到10次，进入管理后台');
      wx.showToast({
        title: '进入管理后台',
        icon: 'success',
        duration: 1500
      });
      
      // 延迟跳转，让用户看到提示
      setTimeout(() => {
        wx.navigateTo({
          url: '/pages/admin/admin'
        });
      }, 500);
      
      // 重置计数
      this.setData({
        adminClickCount: 0,
        lastClickTime: 0,
        adminClickTimer: null
      });
      return;
    }
    
    // 更新计数，并设置 2 秒后重置
    const timer = setTimeout(() => {
      console.log('2秒后重置计数');
      this.setData({
        adminClickCount: 0,
        lastClickTime: 0,
        adminClickTimer: null
      });
    }, 2000);
    
    this.setData({
      adminClickCount: newCount,
      lastClickTime: currentTime,
      adminClickTimer: timer
    });
    
    // 显示点击提示（可选）
    if (newCount >= 9) {
      wx.showToast({
        title: `${5 - newCount} 次后进入管理`,
        icon: 'none',
        duration: 1000
      });
    }
  },

  // 跳转到管理后台（保留以便其他方式使用）
  goToAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin'
    });
  }
});