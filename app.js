// app.js
// App({
//   onLaunch(options) {
//     // 小程序启动时执行的逻辑（可选）
//     console.log('小程序启动', options);
//   },
//   onShow(options) {
//     // 小程序切前台时执行（可选）
//   },
//   onHide() {
//     // 小程序切后台时执行（可选）
//   },
//   onError(msg) {
//     // 小程序报错时执行（可选）
//     console.error('小程序错误', msg);
//   },
//   // 全局数据/方法（可选）
//   globalData: {
//     userInfo: null
//   }
// })
App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    })
  },
  globalData: {
    userInfo: null
  }
})