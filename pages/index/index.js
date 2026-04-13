Page({
  data: {
    apiData: '点击下方按钮获取数据',
    logs: [],
  },
  onLoad() {
    this.addLog('info', '页面加载完成');
    const websocket_url =getApp().globalData.websocket_url;
    this.setData({
      serverUrl :websocket_url
    });
    this.connectWebSocket();
  },
  goToworkflow() {
    wx.navigateTo({
      url: '/pages/GEO/GEO'
    })
  },
  goToagent() {
    wx.navigateTo({
      url: '/pages/Agent/Agent'
    })
  },
  goToagent_cloud() {
    wx.navigateTo({
      url: '/pages/Agent_cloud/Agent_cloud'
    })
  },

  fetchData() {
    const that = this;
    wx.showLoading({
      title: '加载中...',
    });

    wx.request({
      url: 'http://1392365252-ghfxrheupe.ap-beijing.tencentscf.com', 
      // "https://api.coze.cn/v1/workflow/stream_run"  流式api
      // 'http://1392365252-ghfxrheupe.ap-beijing.tencentscf.com', // 测试 API
      method: 'POST',
      header: {
        // 关键：声明参数格式为JSON
        "Authorization": "Bearer sat_1R2fSBGVXC2qfvWT8FEiKkaemopvcDBVRAFx3jf80QvRUaHLDJB7Q6PZ4HuuNuGN",
        "Content-Type": "application/json"
      },
      // 要传输的参数（JSON对象）
      data: {
        "workflow_id": "7552729187959636003",
        "parameters": {
            "input": "智威水果店的售后服务"
        },
        "connector_id": "10000127"
      },
      success(res) {
        console.log(res.data);
        // 将获取到的数据格式化为字符串显示
        // 这里假设返回的是 JSON 对象，我们展示其中的 title 字段，或者整个对象
        // 为了演示清晰，我们展示 title
        const displayContent = res.data.title ? res.data.title : JSON.stringify(res.data);

        that.setData({
          apiData: displayContent
        });
      },
      fail(err) {
        console.error(err);
        that.setData({
          apiData: '请求失败，请检查网络或控制台错误信息'
        });
      },
      complete() {
        wx.hideLoading();
      }
    });
  },
  // 连接WebSocket
  connectWebSocket() {
    if (this.data.isConnected) {
      wx.showToast({
        title: '已连接',
        icon: 'none'
      });
      return;
    }

    const url = this.data.serverUrl;
    this.addLog('info', `正在连接: ${url}`);

    // 创建WebSocket连接
    this.setData({
      socketTask: wx.connectSocket({
        url: url,
        success: () => {
          this.addLog('info', 'WebSocket连接创建成功');
        },
        fail: (err) => {
          this.addLog('error', `连接失败: ${err.errMsg}`);
          this.tryReconnect();
        }
      })
    });

    // 监听WebSocket事件
    // this.listenWebSocketEvents();
  },
  // 添加日志
  addLog(type, content) {
    const time = this.formatTime(new Date());
    const log = {
      type: type,
      time: time,
      content: content
    };

    this.setData({
      logs: [log, ...this.data.logs].slice(0, 100) // 限制日志数量
    });
  },
  // 格式化时间
  formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  },

})
    


