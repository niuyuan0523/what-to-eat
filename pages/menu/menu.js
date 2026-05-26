Page({
  data: {
    // 1. Mock 模拟数据
    categories: [
  {
    "id": "cate_01",
    "name": "热销好物",
    "goodsList": [
      { "id": "g_01", "name": "招牌珍珠奶茶", "price": 16, "originalPrice": 18, "sales": 520, "image": "https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=200", "desc": "经典红茶底配上Q弹现煮珍珠，醇香浓郁。" },
      { "id": "g_02", "name": "多肉葡萄冰沙", "price": 22, "originalPrice": 22, "sales": 340, "image": "https://images.unsplash.com/photo-1536935338788-846bb9981813?w=200", "desc": "满杯手剥新鲜葡萄果肉，搭配清爽绿茶冰沙。" },
      { "id": "g_03", "name": "杨枝甘露", "price": 20, "originalPrice": 24, "sales": 610, "image": "https://images.unsplash.com/photo-1546173159-315724a31696?w=200", "desc": "浓郁芒果肉混合清爽西柚粒，椰奶香气十足。" },
      { "id": "g_04", "name": "芋泥波波鲜奶", "price": 19, "originalPrice": 22, "sales": 480, "image": "https://images.unsplash.com/photo-1558857563-b371033873b8?w=200", "desc": "手捣绵密芋泥，融入纯鲜奶与Q弹波波。" },
      { "id": "g_05", "name": "芝芝莓莓", "price": 24, "originalPrice": 26, "sales": 730, "image": "https://images.unsplash.com/photo-1497534446932-c925b458314e?w=200", "desc": "精选新鲜草莓打成冰沙，盖上醇厚海盐芝士奶盖。" },
      { "id": "g_06", "name": "鸭屎香柠檬茶", "price": 14, "originalPrice": 16, "sales": 920, "image": "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=200", "desc": "潮州单丛茶底碰撞新鲜香水柠檬，清爽回甘。" },
      { "id": "g_07", "name": "桃桃乌龙茶", "price": 18, "originalPrice": 20, "sales": 310, "image": "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=200", "desc": "清香乌龙茶底与多汁白桃肉的完美邂逅。" },
      { "id": "g_08", "name": "满杯百香果", "price": 15, "originalPrice": 15, "sales": 450, "image": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=200", "desc": "酸甜百香果搭配酸桔与珍珠、椰果，口感丰富。" },
      { "id": "g_09", "name": "黑糖鹿丸鲜奶", "price": 21, "originalPrice": 23, "sales": 550, "image": "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=200", "desc": "慢火熬制黑糖珍珠，挂壁纹路吸睛，奶香浓郁。" },
      { "id": "g_10", "name": "多肉青提", "price": 22, "originalPrice": 25, "sales": 390, "image": "https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?w=200", "desc": "皮薄多汁的阳光玫瑰青提，口口爆汁。" }
    ]
  },
  {
    "id": "cate_02",
    "name": "现磨咖啡",
    "goodsList": [
      { "id": "g_11", "name": "生椰拿铁", "price": 18, "originalPrice": 24, "sales": 888, "image": "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=200", "desc": "冷榨生椰乳碰撞高品质浓缩咖啡，椰香四溢。" },
      { "id": "g_12", "name": "美式咖啡", "price": 12, "originalPrice": 15, "sales": 150, "image": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200", "desc": "经典意式浓缩加入纯净水，口感纯粹提神。" },
      { "id": "g_15", "name": "卡布奇诺", "price": 16, "originalPrice": 20, "sales": 210, "image": "https://images.unsplash.com/photo-1534778101976-62847782c213?w=200", "desc": "绵密丰厚的牛奶奶泡，与浓缩咖啡完美融合。" },
      { "id": "g_16", "name": "焦糖玛奇朵", "price": 20, "originalPrice": 24, "sales": 330, "image": "https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=200", "desc": "香草糖浆与鲜奶奠基，覆上浓缩咖啡与焦糖酱淋面。" },
      { "id": "g_17", "name": "燕麦拿铁", "price": 20, "originalPrice": 25, "sales": 420, "image": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=200", "desc": "选用进口植物燕麦奶，低脂健康，自带坚果麦香。" },
      { "id": "g_18", "name": "摩卡咖啡", "price": 19, "originalPrice": 23, "sales": 190, "image": "https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=200", "desc": "浓缩咖啡与香浓巧克力酱的浪漫结合，微苦微甜。" },
      { "id": "g_19", "name": "冰摇桃桃乌龙美式", "price": 16, "originalPrice": 22, "sales": 305, "image": "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=200", "desc": "白桃乌龙的清甜果香打破美式的沉闷，夏日解腻神器。" },
      { "id": "g_20", "name": "厚乳拿铁", "price": 18, "originalPrice": 24, "sales": 510, "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=200", "desc": "精选冷冻浓缩牛奶，奶味更醇厚，咖啡更香浓。" }
    ]
  },
  {
    "id": "cate_03",
    "name": "烘焙甜点",
    "goodsList": [
      { "id": "g_21", "name": "原味芝士蛋糕", "price": 15, "originalPrice": 15, "sales": 98, "image": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=200", "desc": "浓郁重芝士，入口即化，甜而不腻。" },
      { "id": "g_22", "name": "宇治抹茶大福", "price": 10, "originalPrice": 12, "sales": 120, "image": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=200", "desc": "外皮Q弹黏糯，内馅抹茶茶香浓郁。" },
      { "id": "g_23", "name": "法式巧克力可颂", "price": 12, "originalPrice": 14, "sales": 240, "image": "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=200", "desc": "层层酥脆的起酥皮，包裹优质黑巧克力内芯。" },
      { "id": "g_24", "name": "经典提拉米苏", "price": 18, "originalPrice": 22, "sales": 185, "image": "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=200", "desc": "带有一丝马斯卡彭干酪的醇厚与咖啡酒香，微苦高级。" },
      { "id": "g_25", "name": "海盐焦糖千层蛋糕", "price": 22, "originalPrice": 25, "sales": 140, "image": "https://images.unsplash.com/photo-1550617931-e17a7b70dce2?w=200", "desc": "二十余层薄如蝉翼的蛋皮，夹着海盐焦糖奶油。" },
      { "id": "g_26", "name": "红丝绒切片蛋糕", "price": 18, "originalPrice": 18, "sales": 85, "image": "https://images.unsplash.com/photo-1616031037011-087000171abe?w=200", "desc": "华丽的红丝绒蛋糕胚，搭配乳酪糖霜，口感扎实。" },
      { "id": "g_27", "name": "香草闪电泡芙", "price": 14, "originalPrice": 16, "sales": 160, "image": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=200", "desc": "酥脆外皮内注满细腻的香草籽卡士达酱。" },
      { "id": "g_28", "name": "蔓越莓司康", "price": 8, "originalPrice": 10, "sales": 310, "image": "https://images.unsplash.com/photo-1584776296944-ab6fb57b0bdd?w=200", "desc": "英式传统茶点，外酥内软，伴有蔓越莓干的酸甜。" },
      { "id": "g_29", "name": "草莓奶油瑞士卷", "price": 16, "originalPrice": 19, "sales": 220, "image": "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=200", "desc": "湿润的戚风蛋糕体，卷入轻盈动物奶油与鲜草莓丁。" },
      { "id": "g_30", "name": "马卡龙礼盒(2枚入)", "price": 20, "originalPrice": 24, "sales": 75, "image": "https://images.unsplash.com/photo-1569864358642-9d1684040f43?w=200", "desc": "少女的酥胸，经典法式甜点，外酥内软，色彩缤纷。" }
    ]
  }
],
    currentTab: 0,        // 当前选中的分类索引
    toView: 'cate_01',    // 右侧滚动到的锚点ID
    cartCount: 0,         // 购物车徽标数量
    showCart: false,      // 是否显示购物车弹窗
    cartItems: [],        // 购物车商品列表
    totalPrice: 0,        // 购物车总价
    categoryTops: []      // 分类标题距离顶部的距离数组
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
  }
});