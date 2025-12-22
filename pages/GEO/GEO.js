// pages/GEO/GEO.js

Page({
  data: {
    // 连接状态
    isConnected: false,
    isexpanded: true,
    serverUrl: "wss://geo-mini-backend-prod-8g52b3gg19eac702-1314260299.ap-shanghai.run.wxcloudrun.com",
    // 微信云托管
    // "wss://geo-mini-backend-prod-8g52b3gg19eac702-1314260299.ap-shanghai.run.wxcloudrun.com"
    //
    workflow_id: '7552729187959636003',
    // 7552729187959636003 测试工作流ID
    // 7566453172001554438 GEO先锋测试

    // 消息
    message: '你好',
    receivedData: '',

    // 日志
    logs: [],

    // WebSocket实例
    socketTask: null,

    // 心跳定时器
    heartbeatTimer: null,

    // 重连相关
    reconnectTimer: null,
    reconnectCount: 0,
    maxReconnectCount: 5
  },

  onLoad() {
    this.addLog('info', '页面加载完成');
    this.connectWebSocket();
  },

  onUnload() {
    this.disconnectWebSocket();
  },

  // 输入框变化处理
  onIDChange(e) {
    this.setData({
      workflow_id: e.detail.value
    });
  },

  onMessageChange(e) {
    this.setData({
      message: e.detail.value
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

  // 切换思考内容折叠状态
  changeisexpanded() {
    this.setData({
      isexpanded: !this.data.isexpanded
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

        if (data.done) {
          this.addLog('receive', '[传输完成]');
          this.setData({isexpanded: true})
          this.addLog('info', `共收到 ${data.total_chunks || '未知数量'} 个数据块`);
        } else if (data.error) {
          this.addLog('error', `错误: ${data.error}`);
        } else {
          // 显示接收到的内容
          const content = data.content || '';
          this.addLog('receive', content);

          // 更新显示的数据
          this.setData({
            receivedData: this.data.receivedData + content
          });
        }
      } catch (error) {
        this.addLog('receive', `原始数据: ${res.data}`);
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
    });
  },

  // 发送消息
  sendMessage() {
    if (!this.data.isConnected) {
      wx.showToast({
        title: '未连接',
        icon: 'none'
      });
      return;
    }

    const message = this.data.message.trim();
    if (!message) {
      wx.showToast({
        title: '消息不能为空',
        icon: 'none'
      });
      return;
    }
    const workflow_ID =this.data.workflow_id.trim();
    const data = {
      task: message,
      workflow_id: workflow_ID
    };

    try {
      this.data.socketTask.send({
        data: JSON.stringify(data),
        success: () => {
          this.addLog('send', message);
          this.setData({ receivedData: '' }); // 清空之前的数据
        },
        fail: (err) => {
          this.addLog('error', `发送失败: ${err.errMsg}`);
        }
      });
    } catch (error) {
      this.addLog('error', `发送异常: ${error.message}`);
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

  // 清空日志
  clearLog() {
    this.setData({
      logs: [],
      receivedData: ''
    });
    this.addLog('info', '日志已清空');
  },

  // 测试发送不同类型的数据
  sendTestMessage(type) {
    const testMessages = {
      normal: '正常的查询消息',
      long: '这是一个比较长的测试消息，用于测试服务器处理长文本的能力。',
      special: '特殊字符测试：!@#$%^&*()_+-=[]{}|;:,.<>?',
      chinese: '中文测试：你好，世界！这是一个中文测试消息。'
    };

    this.setData({
      message: testMessages[type] || testMessages.normal
    });

    this.sendMessage();
  }
});