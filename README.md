# What to Eat 微信小程序

## 项目简介
这是一个帮助用户决定"吃什么"的微信小程序，提供菜单推荐和选择功能。

## 技术栈
- 微信小程序原生开发
- Vant Weapp UI 组件库

## 架构说明
本项目采用「主包 + 独立分包」架构。主包仅保留首页，各功能模块拆分为**独立分包**（`"independent": true`），用户可直接进入任一分包，无需加载主包即可启动，加载更快、模块间彼此隔离。

- **点单模块**（`packageOrder`）：浏览菜单、下单、查看订单
- **后台管理模块**（`packageAdmin`）：菜单维护、数据管理

> 独立分包不能引用主包资源（含 `miniprogram_npm`），因此各分包分别构建自己的 npm 依赖，并在页面模块顶部各自初始化云开发环境（`wx.cloud.init`）。

## 项目结构
```
├── pages/                        # 主包页面目录
│   └── index/                    # 首页（顶部介绍 + 模块卡片入口）
├── packageOrder/                 # 独立分包：点单模块
│   ├── pages/menu/               # 点菜 / 订单列表页
│   ├── pages/order-detail/       # 订单详情页
│   └── miniprogram_npm/          # 分包 npm 依赖（构建后生成）
├── packageAdmin/                 # 独立分包：后台管理模块
│   ├── pages/admin/              # 数据管理后台页
│   └── miniprogram_npm/          # 分包 npm 依赖（构建后生成）
├── cloudfunctions/               # 云函数目录
├── app.js                        # 小程序入口文件（初始化云环境）
├── app.json                      # 全局配置（pages + subPackages）
├── app.wxss                      # 全局样式
├── package.json                  # 项目依赖配置
└── project.config.json           # 项目配置文件（分包 npm 构建）
```

## 安装与运行

1. 克隆项目到本地
```bash
git clone <your-repo-url>
cd what-to-eat
```

2. 安装依赖
```bash
npm install
```

3. 构建 npm 包
在微信开发者工具中，点击 工具 -> 构建 npm。由于采用独立分包，构建后会分别在 `packageOrder/` 与 `packageAdmin/` 下生成各自的 `miniprogram_npm`。

4. 使用微信开发者工具打开项目，选择 project.config.json 所在目录即可预览

## 功能特性
- 随机推荐菜品
- 菜品分类展示
- 用户交互体验优化

## 开发说明
- 使用微信小程序原生开发框架
- UI 组件采用 Vant Weapp
- 遵循微信小程序开发规范

## 许可证
ISC