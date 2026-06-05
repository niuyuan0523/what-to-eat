Page({
  data: {
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
    this.loadCategoriesFromCloud();
  },

  // 从云开发数据库加载分类数据
  loadCategoriesFromCloud() {
    wx.showLoading({
      title: '加载中...'
    });

    console.log('开始从云数据库加载数据...');

    // 使用云数据库获取数据
    const db = wx.cloud.database();
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
          wx.showToast({
            title: '加载成功',
            icon: 'success',
            duration: 1500
          });
          
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
          wx.showToast({
            title: '订单已提交',
            icon: 'success',
            duration: 2000
          });
          // 清空购物车
          this.clearCart();
        }
      }
    });
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
    if (newCount >= 5) {
      console.log('达到5次，进入管理后台');
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
    if (newCount >= 4) {
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