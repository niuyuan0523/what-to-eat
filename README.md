# What to Eat 微信小程序

## 项目简介
这是一个帮助用户决定"吃什么"的微信小程序，提供菜单推荐和选择功能。

## 技术栈
- 微信小程序原生开发
- Vant Weapp UI 组件库

## 项目结构
```
├── pages/                # 页面目录
│   └── menu/            # 菜单页面
├── app.js               # 小程序入口文件
├── app.json             # 小程序全局配置
├── app.wxss             # 小程序全局样式
├── package.json         # 项目依赖配置
└── project.config.json  # 项目配置文件
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
在微信开发者工具中，点击 工具 -> 构建 npm

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