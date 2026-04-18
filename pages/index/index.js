Page({
  data: {
    apiData: '点击下方按钮获取数据',
    logs: [],
    serverUrl:"",
    oss_url :"",
    // WebSocket实例
    socketTask: null,
    // 连接状态
    isConnected: false,
    // 心跳定时器
    heartbeatTimer: null,
    // 重连相关
    reconnectTimer: null,
    reconnectCount: 0,
    maxReconnectCount: 5
  },
  onLoad() {
    this.addLog('info', '页面加载完成');
    const websocket_url =getApp().globalData.websocket_url;
    const oss_url =getApp().globalData.oss_url;
    this.setData({
      serverUrl :websocket_url,
      oss_url : oss_url
    });
    this.connectWebSocket();
  },

  onUnload() {
    this.disconnectWebSocket();
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
  goTogame() {
    wx.navigateTo({
      url: '/pages/Game/game'
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
    this.listenWebSocketEvents();
  },

  // 监听WebSocket事件
  listenWebSocketEvents() {
    const socketTask = this.data.socketTask;
    if (!socketTask) return;

    // 监听连接打开
    socketTask.onOpen(() => {
      this.addLog('info', 'WebSocket连接已打开');
      this.setData({
        isConnected: true,
        reconnectCount: 0
      });

      // 清除重连定时器
      if (this.data.reconnectTimer) {
        clearTimeout(this.data.reconnectTimer);
        this.setData({ reconnectTimer: null });
      }

      // 开始心跳检测
      this.startHeartbeat();
    });

    // 监听收到消息
    socketTask.onMessage((res) => {
      try {
        const data = JSON.parse(res.data);
        this.addLog('receive', `收到消息: ${res.data}`);
      } catch (error) {
        this.addLog('receive', `收到消息: ${res.data}`);
      }
    });

    // 监听连接关闭
    socketTask.onClose((res) => {
      this.addLog('info', `连接关闭: ${res.code} - ${res.reason}`);
      this.setData({ isConnected: false });

      // 停止心跳
      this.stopHeartbeat();

      // 如果不是主动断开，尝试重连
      if (res.code !== 1000) { // 1000表示正常关闭
        this.tryReconnect();
      }
    });

    // 监听错误
    socketTask.onError((err) => {
      this.addLog('error', `WebSocket错误: ${err.errMsg}`);
      this.setData({ isConnected: false });
      this.stopHeartbeat();
      this.tryReconnect();
    });
  },

  // 心跳检测
  startHeartbeat() {
    this.stopHeartbeat(); // 先停止之前的

    const heartbeat = () => {
      if (this.data.isConnected && this.data.socketTask) {
        try {
          this.data.socketTask.send({
            data: JSON.stringify({ type: 'ping', timestamp: Date.now() }),
            success: () => {
              this.addLog('info', '心跳发送成功');
            }
          });
        } catch (error) {
          // 忽略心跳发送错误
        }
      }
    };

    // 每隔30秒发送一次心跳
    this.setData({
      heartbeatTimer: setInterval(heartbeat, 30000)
    });

    // 立即发送一次心跳
    heartbeat();
  },

  stopHeartbeat() {
    if (this.data.heartbeatTimer) {
      clearInterval(this.data.heartbeatTimer);
      this.setData({ heartbeatTimer: null });
    }
  },

  // 断开连接
  disconnectWebSocket() {
    if (this.data.socketTask) {
      this.data.socketTask.close({
        code: 1000,
        reason: '用户主动关闭'
      });

      this.setData({
        socketTask: null,
        isConnected: false
      });

      this.addLog('info', '已主动断开连接');
      this.stopHeartbeat();

      // 清除重连定时器
      if (this.data.reconnectTimer) {
        clearTimeout(this.data.reconnectTimer);
        this.setData({ reconnectTimer: null });
      }
    }
  },

  // 重连机制
  tryReconnect() {
    if (this.data.reconnectCount >= this.data.maxReconnectCount) {
      this.addLog('error', '重连次数已达上限，停止重连');
      return;
    }

    this.setData({
      reconnectCount: this.data.reconnectCount + 1
    });

    const delay = Math.min(1000 * Math.pow(2, this.data.reconnectCount), 30000);

    this.addLog('info', `将在 ${delay / 1000} 秒后尝试重连 (${this.data.reconnectCount}/${this.data.maxReconnectCount})`);

    this.setData({
      reconnectTimer: setTimeout(() => {
        this.connectWebSocket();
      }, delay)
    });
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
    


