// pages/Agent/Agent.js


Page({
  data: {
    // 连接状态
    isConnected: false,
    isexpanded: true,
    serverUrl: "",
    // 微信云托管
    // "wss://geo-mini-backend-prod-8g52b3gg19eac702-1314260299.ap-shanghai.run.wxcloudrun.com"
    //
    // 1. 滚动轮盘的预设选项（自定义名字+对应ID，可根据需求扩展）
    Agent_List: [
      { name: "测试", id: "7537224044387713078" },
      { name: "聊天", id: "7552806661178572863" },
      { name: "风险评估", id: "7535656301062979594" },
      { name: "福建特产销售", id: "7619310356497973286" },
      { name: "北京化工大学小助手", id: "7588471857893244938" }
    ],
    Agent_Name_List: [], 
    // 2. 选中的轮盘选项索引（默认选第一个）
    selectedIndex: 0,
    conversation_id:false,
    user_id:"101",
    agent_id: '7537224044387713078',
    // 7537224044387713078 测试
    // 7566453172001554438 GEO先锋测试

    // 消息
    message: '你好',
    inputMessage: '', // 新增：聊天输入框的消息
    receivedData: '',
    // receivedData: '',
    thinkingdata: '',
    resultdata: '',
    cotent_type: '',
    THINKING_DELIMITER: "###thinking###:",
    RESULT_DELIMITER: "###result###:",


    // 聊天消息列表
    chatMessages: [], // 存储聊天记录

    // 接收状态
    isReceivingDone: false, // 标记是否已完成接收

    // 日志
    logs: [],

    // WebSocket实例
    socketTask: null,

    // 心跳定时器
    heartbeatTimer: null,

    // 重连相关
    reconnectTimer: null,
    reconnectCount: 0,
    maxReconnectCount: 5,

    // 滚动位置
    scrollTop: 0,

    // 历史记录相关
    showHistoryPanel: false,
    chatHistory: [],

    // 头像相关
    currentAvatar: '',
    avatarMapping: {},
    showAvatarModal: false,
    displayedAvatars: [],
    hasMoreAvatars: false,
    avatarPageSize: 5,
    avatarCurrentPage: 1
  },

  // 可选头像列表
  avatarList: [
    { name: '狗律师', path: '/images/狗律师.webp' },
    { name: '猫律师', path: '/images/猫律师.webp' },
    { name: '鳄鱼', path: '/images/鳄鱼.webp' }
  ],

  onLoad() {
    this.addLog('info', '页面加载完成');
    const websocket_url =getApp().globalData.websocket_url;
    this.setData({
      serverUrl :websocket_url
    });
    this.connectWebSocket();
    const Agent_Name_List = this.data.Agent_List.map(item => item.name);
    this.setData({
      Agent_Name_List: Agent_Name_List,
      agent_id: this.data.Agent_List[0].id
    });
    this.loadChatHistory();
    this.loadAvatarMapping();
    this.updateCurrentAvatar();
  },

  // 加载头像映射
  loadAvatarMapping() {
    try {
      const mapping = wx.getStorageSync('agentAvatarMapping') || {};
      this.setData({ avatarMapping: mapping });
    } catch (e) {
      this.addLog('error', `加载头像映射失败: ${e.message}`);
    }
  },

  // 保存头像映射
  saveAvatarMapping() {
    try {
      wx.setStorageSync('agentAvatarMapping', this.data.avatarMapping);
    } catch (e) {
      this.addLog('error', `保存头像映射失败: ${e.message}`);
    }
  },

  // 更新当前头像
  updateCurrentAvatar() {
    const agentId = this.data.agent_id;
    const avatar = this.data.avatarMapping[agentId] || '';
    this.setData({ currentAvatar: avatar });
  },

  // 选择头像
  chooseAvatar() {
    // 重置分页
    this.setData({
      avatarCurrentPage: 1,
      avatarPageSize: 5
    });
    this.updateDisplayedAvatars();

    // 显示弹窗
    this.setData({
      showAvatarModal: true
    });
  },

  // 关闭头像选择弹窗
  closeAvatarModal() {
    this.setData({
      showAvatarModal: false
    });
  },

  // 更新显示的头像列表
  updateDisplayedAvatars() {
    const pageSize = this.data.avatarPageSize;
    const currentPage = this.data.avatarCurrentPage;
    const startIndex = 0;
    const endIndex = currentPage * pageSize;

    const displayed = this.avatarList.slice(startIndex, endIndex);
    const hasMore = endIndex < this.avatarList.length;

    this.setData({
      displayedAvatars: displayed,
      hasMoreAvatars: hasMore
    });
  },

  // 显示更多头像
  showMoreAvatars() {
    this.setData({
      avatarPageSize: 10,
      avatarCurrentPage: 1
    });
    this.updateDisplayedAvatars();
  },

  // 选择头像
  selectAvatar(e) {
    const selectedPath = e.currentTarget.dataset.path;
    const agentId = this.data.agent_id;

    // 更新映射
    const mapping = this.data.avatarMapping;
    mapping[agentId] = selectedPath;

    this.setData({
      avatarMapping: mapping,
      currentAvatar: selectedPath,
      showAvatarModal: false
    });

    this.saveAvatarMapping();

    wx.showToast({
      title: '头像已更新',
      icon: 'success'
    });
  },

  // 从本地存储加载聊天历史
  loadChatHistory() {
    try {
      const history = wx.getStorageSync('chatHistory');
      if (history) {
        this.setData({ chatHistory: history });
      }
    } catch (e) {
      this.addLog('error', `加载历史记录失败: ${e.message}`);
    }
  },

  // 保存聊天历史到本地存储（按会话ID分类）
  saveChatHistory() {
    try {
      if (this.data.chatMessages.length === 0) return;

      const conversationId = this.data.conversation_id || 'default';
      const agentItem = this.data.Agent_List[this.data.selectedIndex] || { name: '未知', id: '' };

      // 获取最后一条用户消息作为预览
      let preview = '暂无内容';
      for (let i = this.data.chatMessages.length - 1; i >= 0; i--) {
        if (this.data.chatMessages[i].type === 'user') {
          preview = this.data.chatMessages[i].result_content.substring(0, 50) + (this.data.chatMessages[i].result_content.length > 50 ? '...' : '');
          break;
        }
      }

      const historyItem = {
        conversationId: conversationId,
        agentName: agentItem.name,
        agentId: this.data.agent_id,
        preview: preview,
        messages: this.data.chatMessages,
        timestamp: new Date().getTime(), // 使用时间戳便于排序
        timeString: new Date().toLocaleString()
      };

      let history = this.data.chatHistory || [];

      // 查找是否已存在相同会话ID的记录
      const existingIndex = history.findIndex(item => item.conversationId === conversationId);

      if (existingIndex !== -1) {
        // 更新现有会话
        history[existingIndex] = historyItem;
        // 将该会话移到数组最前面
        history.splice(existingIndex, 1);
        history.unshift(historyItem);
      } else {
        // 添加新会话到数组最前面
        history.unshift(historyItem);
      }

      // 按时间戳排序（新的在前）
      history.sort((a, b) => b.timestamp - a.timestamp);

      // 限制历史记录数量
      if (history.length > 50) {
        history = history.slice(0, 50);
      }

      this.setData({ chatHistory: history });
      wx.setStorageSync('chatHistory', history);
      this.addLog('info', '聊天历史已保存');
    } catch (e) {
      this.addLog('error', `保存历史记录失败: ${e.message}`);
    }
  },

  // 切换历史面板显示
  toggleHistoryPanel() {
    this.setData({
      showHistoryPanel: !this.data.showHistoryPanel
    });
  },

  // 加载选中的历史记录
  loadHistory(e) {
    const index = e.currentTarget.dataset.index;
    const historyItem = this.data.chatHistory[index];
    if (historyItem) {
      this.setData({
        chatMessages: historyItem.messages,
        agent_id: historyItem.agentId,
        conversation_id: historyItem.conversationId,
        showHistoryPanel: false,
        isReceivingDone: true
      });
      wx.showToast({
        title: '已加载历史记录',
        icon: 'success'
      });
    }
  },

  // 删除单条历史记录
  deleteHistory(e) {
    const index = e.currentTarget.dataset.index;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条历史记录吗？',
      success: (res) => {
        if (res.confirm) {
          let history = this.data.chatHistory;
          history.splice(index, 1);
          this.setData({ chatHistory: history });
          wx.setStorageSync('chatHistory', history);
          wx.showToast({
            title: '已删除',
            icon: 'success'
          });
        }
      }
    });
  },

  // 清空当前聊天
  clearChat() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空当前聊天记录吗？',
      success: (res) => {
        if (res.confirm) {
          if (this.data.chatMessages.length > 0) {
            this.saveChatHistory();
          }
          this.setData({
            chatMessages: [],
            receivedData: '',
            thinkingdata: '',
            resultdata: '',
            isReceivingDone: true,
            conversation_id: false
          });
          wx.showToast({
            title: '已清空',
            icon: 'success'
          });
        }
      }
    });
  },

  // 复制消息内容
  copyMessage(e) {
    const content = e.currentTarget.dataset.content;
    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
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

  // 新增：聊天输入框变化处理
  onInputMessageChange(e) {
    this.setData({
      inputMessage: e.detail.value
    });
  },

  onMessageChange(e) {
    this.setData({
      message: e.detail.value
    });
  },
  // 选择轮盘后的事件（原有逻辑保留）
  onPickerChange(e) {
    const selectedIndex = e.detail.value;
    const selectedItem = this.data.Agent_List[selectedIndex];
    this.setData({
      selectedIndex: selectedIndex,
      agent_id: selectedItem.id
    });
    this.updateCurrentAvatar();
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
  change_history_isexpanded(e) {
    const targetIndex = e.currentTarget.dataset.index;
    // 复制原数组，避免直接修改
    const newChatMessages = [...this.data.chatMessages];
    // 修改对应索引的 item
    newChatMessages[targetIndex] = {
      ...newChatMessages[targetIndex],
      history_isexpanded: !newChatMessages[targetIndex].history_isexpanded
    };
    // 更新数组
    this.setData({ chatMessages: newChatMessages });
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
        const {
          currentContentType,
          THINKING_DELIMITER: thinkingDelim, // 思考分界符
          RESULT_DELIMITER: resultDelim,     // 结果分界符
          thinkingdata,
          resultdata
        } = this.data;
        if (data.done) {
          this.addLog('receive', '[传输完成]');
          const conversation_id=data.content.conversation_id

          // 添加AI回复到聊天记录
          if (this.data.receivedData) {
            const aiMessage = {
              id: Date.now(),
              type: 'ai',
              content: this.data.receivedData,
              thinking_content: this.data.thinkingdata,
              result_content: this.data.resultdata,
              timestamp: new Date().toLocaleTimeString(),
              history_isexpanded: false
            };

            this.setData({
              chatMessages: [...this.data.chatMessages, aiMessage],
              isexpanded: false,
              isReceivingDone: true,
              conversation_id: conversation_id,
              receivedData: '',
              thinkingdata: '',
              resultdata: ''
            });
            this.saveChatHistory();
          }

          this.addLog('info', `共收到 ${data.total_chunks || '未知数量'} 个数据块`);
        } else if (data.error) {
          this.addLog('error', `错误: ${data.error}`);
        } else {
          // 显示接收到的内容
          const content = data.content || '';
          if (content.includes('###thinking###:')) {
            this.setData({
              cotent_type: "thinking",
              isexpanded: true
            });
            const [before_content, after_content] = content.split(thinkingDelim)
            this.setData({
              thinkingdata: thinkingdata + after_content,
              resultdata: resultdata + before_content
            }
            );
            return;

          }
          if (content.includes('###result###:')) {
            this.setData({
              cotent_type: "result",
              isexpanded: false
            });
            const [before_content, after_content] = content.split(resultDelim)
            this.setData({
              thinkingdata: thinkingdata + before_content,
              resultdata: resultdata + after_content
            });
            return;
          }
          this.addLog('receive', content);

          // 更新显示的数据
          if (this.data.cotent_type == "thinking") {
            this.setData({
              thinkingdata: this.data.thinkingdata + content
            });
          }
          else if (this.data.cotent_type == "result") {
            this.setData({
              resultdata: this.data.resultdata + content
            });
          }

          this.setData({
            receivedData: this.data.receivedData + content,
            isReceivingDone: false
          });
        }
      } catch (error) {
        const errorMsg = `错误类型：${error.name || '未知错误'}\n错误描述：${error.message}\n调用栈：${error.stack || '无'}`;
        this.addLog('receive', `原始数据: ${res.data} 错误信息：${errorMsg}`);
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

    // 使用新的输入框内容，如果为空则使用旧的消息字段
    const message = this.data.inputMessage.trim() || this.data.message.trim();
    if (!message) {
      wx.showToast({
        title: '消息不能为空',
        icon: 'none'
      });
      return;
    }

    const agent_ID = this.data.agent_id.trim();
    const data = {
      task: message,
      agent_id: agent_ID,
      conversation_id:this.data.conversation_id,
      user_id:this.data.user_id
    };

    try {
      // 添加用户消息到聊天记录
      const userMessage = {
        id: Date.now(),
        type: 'user',
        result_content: message,
        timestamp: new Date().toLocaleTimeString()
      };

      this.setData({
        chatMessages: [...this.data.chatMessages, userMessage],
        inputMessage: '', // 清空输入框
        receivedData: '' // 清空之前的数据
      });

      this.data.socketTask.send({
        data: JSON.stringify(data),
        success: () => {
          this.addLog('send', message);
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