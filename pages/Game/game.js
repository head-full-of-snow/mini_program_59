// pages/Game/game.js

Page({
  data: {
    // 连接状态
    isConnected: false,
    isexpanded: true,
    serverUrl: "",

    // 固定智能体ID（直接在代码中填写）
    agent_id: '7628750479685976079', // “是或不是”智能体ID 7628750479685976079
    user_id: "101",
    conversation_id: false,

    // 消息
    inputMessage: '',
    receivedData: '',
    thinkingdata: '',
    resultdata: '',
    cotent_type: '',
    THINKING_DELIMITER: "###thinking###:",
    RESULT_DELIMITER: "###result###:",

    // 聊天消息列表
    chatMessages: [],

    // 接收状态
    isReceivingDone: false,

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

    // 滚动跟踪相关
    showScrollToBottomBtn: false,
    isUserScrolling: false,
    lastScrollTop: 0,
    scrollThreshold: 50, // 距离底部多少像素时显示按钮

    // 游戏相关状态
    showStartModal: false, // 开始游戏弹窗
    showModeSelection: false, // 模式选择弹窗
    showAnswerButtons: false, // 答题按钮区域
    gameMode: '', // 'guess'（我猜）或 'answer'（答题）
    showGameEndModal: false, // 游戏结束弹窗
    inputAreaDisabled: false, // 是否禁用输入框
    summarizedConversations: {}, // 记录每个会话的总结状态：'summarized'（已总结）, 'declined'（已拒绝）

    // 历史记录相关
    showHistoryPanel: false,
    chatHistory: [],

    // 头像相关
    currentAvatar: '',
    showAvatarModal: false,
    displayedAvatars: [],
    hasMoreAvatars: false,
    avatarPageSize: 10,
    avatarCurrentPage: 1
  },

  // 可选头像列表（从存储中动态加载）
  avatarList: [],

  onLoad() {
    this.addLog('info', '页面加载完成');
    const websocket_url = getApp().globalData.websocket_url;
    this.setData({
      serverUrl: websocket_url
    });
    this.loadSummaryStatus();
    this.loadChatHistory();
    this.loadAvatarList();
    this.updateCurrentAvatar();
    this.connectWebSocket();
  },

  onUnload() {
    // 停止心跳
    this.stopHeartbeat();

    // 安全断开连接
    if (this.data.socketTask) {
      try {
        this.data.socketTask.close({
          code: 1000,
          reason: '页面卸载'
        });
      } catch (error) {
        // 忽略关闭错误
      }
    }

    // 清空状态
    this.setData({
      socketTask: null,
      isConnected: false
    });
  },

  // WebSocket连接相关
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

    this.listenWebSocketEvents();
  },

  listenWebSocketEvents() {
    const socketTask = this.data.socketTask;
    if (!socketTask) return;

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

      // 连接成功后，显示开始游戏弹窗
      this.setData({
        showStartModal: true
      });

      this.startHeartbeat();
    });

    socketTask.onMessage((res) => {
      try {
        const data = JSON.parse(res.data);
        const {
          cotent_type,
          THINKING_DELIMITER: thinkingDelim,
          RESULT_DELIMITER: resultDelim,
          thinkingdata,
          resultdata
        } = this.data;

        if (data.done) {
          this.addLog('receive', '[传输完成]');
          const conversation_id = data.content.conversation_id;

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

            // 检查游戏结束
            this.checkGameEnd(this.data.resultdata);

            // 保存聊天历史
            this.saveChatHistory();
            // 新消息到达，触发滚动
            this.triggerScrollToBottom();
          }

          this.addLog('info', `共收到 ${data.total_chunks || '未知数量'} 个数据块`);
        } else if (data.error) {
          this.addLog('error', `错误: ${data.error}`);
        } else {
          const content = data.content || '';
          if (content.includes('###thinking###:')) {
            this.setData({
              cotent_type: "thinking",
              isexpanded: true
            });
            const [before_content, after_content] = content.split(thinkingDelim);
            this.setData({
              thinkingdata: thinkingdata + after_content,
              resultdata: resultdata + before_content
            });
            return;
          }

          if (content.includes('###result###:')) {
            this.setData({
              cotent_type: "result",
              isexpanded: false
            });
            const [before_content, after_content] = content.split(resultDelim);
            this.setData({
              thinkingdata: thinkingdata + before_content,
              resultdata: resultdata + after_content
            });
            return;
          }

          this.addLog('receive', content);

          if (this.data.cotent_type == "thinking") {
            this.setData({
              thinkingdata: this.data.thinkingdata + content
            });
          } else if (this.data.cotent_type == "result") {
            this.setData({
              resultdata: this.data.resultdata + content
            });
          }

          this.setData({
            receivedData: this.data.receivedData + content,
            isReceivingDone: false
          });
          // 接收流式数据时触发滚动
          this.triggerScrollToBottom();
        }
      } catch (error) {
        const errorMsg = `错误类型：${error.name || '未知错误'}\n错误描述：${error.message}`;
        this.addLog('receive', `原始数据: ${res.data} 错误信息：${errorMsg}`);
      }
    });

    socketTask.onClose((res) => {
      this.addLog('info', `连接关闭: ${res.code} - ${res.reason}`);
      this.setData({ isConnected: false });
      this.stopHeartbeat();

      if (res.code !== 1000) {
        this.tryReconnect();
      }
    });

    socketTask.onError((err) => {
      this.addLog('error', `WebSocket错误: ${err.errMsg}`);
      this.setData({ isConnected: false });
      this.stopHeartbeat();
      this.tryReconnect();
    });
  },

  // 检查游戏结束
  checkGameEnd(result) {
    if (result && result.includes('游戏结束')) {
      const conversationId = this.data.conversation_id;
      const summaryStatus = this.data.summarizedConversations[conversationId];

      // 如果该会话已经总结过或拒绝过，则不显示弹窗
      if (summaryStatus === 'summarized' || summaryStatus === 'declined') {
        this.addLog('info', `会话 ${conversationId} 的总结状态: ${summaryStatus}`);
        return;
      }

      // 否则显示总结选项弹窗
      this.setData({
        showGameEndModal: true
      });
    }
  },

  // 游戏流程控制
  startGame() {
    this.setData({
      showStartModal: false,
      showModeSelection: true
    });
  },

  // 关闭开始游戏弹窗
  closeStartModal() {
    this.setData({
      showStartModal: false
    });
  },

  selectMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      gameMode: mode,
      showModeSelection: false
    });

    if (mode === 'guess') {
      // 我猜模式：保持输入框
      this.setData({
        inputAreaDisabled: false,
        showAnswerButtons: false
      });
      this.sendModeMessage('我来猜猜你想什么');
    } else if (mode === 'answer') {
      // 答题模式：隐藏输入框，显示答题按钮
      this.setData({
        inputAreaDisabled: true,
        showAnswerButtons: true
      });
      this.sendModeMessage('你来猜猜我想什么');
    }
  },

  // 关闭模式选择弹窗
  closeModeSelection() {
    this.setData({
      showModeSelection: false
    });
  },

  // 发送模式选择消息
  sendModeMessage(message) {
    if (!this.data.isConnected) return;

    const data = {
      task: message,
      agent_id: this.data.agent_id,
      conversation_id: this.data.conversation_id,
      user_id: this.data.user_id
    };

    const userMessage = {
      id: Date.now(),
      type: 'user',
      result_content: message,
      timestamp: new Date().toLocaleTimeString()
    };

    this.setData({
      chatMessages: [...this.data.chatMessages, userMessage],
      receivedData: ''
    });

    // 发送消息后滚动到底部
    this.triggerScrollToBottom();

    this.data.socketTask.send({
      data: JSON.stringify(data),
      success: () => {
        this.addLog('send', message);
      },
      fail: (err) => {
        this.addLog('error', `发送失败: ${err.errMsg}`);
      }
    });
  },

  // 发送答题消息
  sendAnswer(e) {
    const answer = e.currentTarget.dataset.answer;
    this.sendModeMessage(answer);
  },

  // 游戏结束后的选择
  handleGameEndChoice(e) {
    const choice = e.currentTarget.dataset.choice;
    const conversationId = this.data.conversation_id;

    if (choice === 'summary') {
      // 总结本次游戏 - 发送消息给AI
      this.updateSummaryStatus(conversationId, 'summarized');
      this.sendModeMessage('请总结本次游戏');
    } else if (choice === 'nothing') {
      // 暂时不用 - 不发送消息，但标记为已拒绝
      this.updateSummaryStatus(conversationId, 'declined');
      wx.showToast({
        title: '已跳过总结',
        icon: 'none'
      });
    }

    this.setData({
      showGameEndModal: false
    });
  },

  // 关闭游戏结束弹窗
  closeGameEndModal() {
    this.setData({
      showGameEndModal: false
    });
  },

  // 更新会话的总结状态
  updateSummaryStatus(conversationId, status) {
    const summarizedConversations = this.data.summarizedConversations;
    summarizedConversations[conversationId] = status;

    this.setData({
      summarizedConversations: summarizedConversations
    });

    this.saveSummaryStatus();
    this.addLog('info', `会话 ${conversationId} 总结状态已更新为: ${status}`);
  },

  // 从本地存储加载总结状态
  loadSummaryStatus() {
    try {
      const status = wx.getStorageSync('gameSummaryStatus');
      if (status) {
        this.setData({
          summarizedConversations: status
        });
        this.addLog('info', '已加载总结状态记录');
      }
    } catch (e) {
      this.addLog('error', `加载总结状态失败: ${e.message}`);
    }
  },

  // 保存总结状态到本地存储
  saveSummaryStatus() {
    try {
      wx.setStorageSync('gameSummaryStatus', this.data.summarizedConversations);
    } catch (e) {
      this.addLog('error', `保存总结状态失败: ${e.message}`);
    }
  },

  // 输入框相关
  onInputMessageChange(e) {
    this.setData({
      inputMessage: e.detail.value
    });
  },

  sendMessage() {
    if (!this.data.isConnected) {
      wx.showToast({
        title: '未连接',
        icon: 'none'
      });
      return;
    }

    const message = this.data.inputMessage.trim();
    if (!message) {
      wx.showToast({
        title: '消息不能为空',
        icon: 'none'
      });
      return;
    }

    const data = {
      task: message,
      agent_id: this.data.agent_id,
      conversation_id: this.data.conversation_id,
      user_id: this.data.user_id
    };

    const userMessage = {
      id: Date.now(),
      type: 'user',
      result_content: message,
      timestamp: new Date().toLocaleTimeString()
    };

    this.setData({
      chatMessages: [...this.data.chatMessages, userMessage],
      inputMessage: '',
      receivedData: ''
    });

    // 发送消息后滚动到底部
    this.triggerScrollToBottom();

    this.data.socketTask.send({
      data: JSON.stringify(data),
      success: () => {
        this.addLog('send', message);
      },
      fail: (err) => {
        this.addLog('error', `发送失败: ${err.errMsg}`);
      }
    });
  },

  disconnectWebSocket() {
    if (!this.data.socketTask) {
      return;
    }

    try {
      // 先停止心跳，避免心跳继续发送
      this.stopHeartbeat();

      // 尝试关闭连接
      this.data.socketTask.close({
        code: 1000,
        reason: '用户主动关闭'
      });

      this.addLog('info', '已主动断开连接');
    } catch (error) {
      this.addLog('error', `关闭连接时出错: ${error.message || error}`);
    } finally {
      // 无论成功与否，都清空状态
      this.setData({
        socketTask: null,
        isConnected: false
      });
    }

    // 清除重连定时器
    if (this.data.reconnectTimer) {
      clearTimeout(this.data.reconnectTimer);
      this.setData({ reconnectTimer: null });
    }
  },

  startHeartbeat() {
    this.stopHeartbeat();

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

    this.setData({
      heartbeatTimer: setInterval(heartbeat, 30000)
    });

    heartbeat();
  },

  stopHeartbeat() {
    if (this.data.heartbeatTimer) {
      clearInterval(this.data.heartbeatTimer);
      this.setData({ heartbeatTimer: null });
    }
  },

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

  addLog(type, content) {
    const time = this.formatTime(new Date());
    const log = {
      type: type,
      time: time,
      content: content
    };

    this.setData({
      logs: [log, ...this.data.logs].slice(0, 100)
    });
  },

  formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  },

  // 滚动事件处理
  onScroll(e) {
    const scrollTop = e.detail.scrollTop;
    const scrollHeight = e.detail.scrollHeight;
    const viewHeight = e.detail.scrollHeight - scrollTop;

    // 判断是否在底部
    const isAtBottom = (scrollHeight - scrollTop - viewHeight) < this.data.scrollThreshold;

    // 检测用户是否向上滚动（手动滚动）
    if (scrollTop < this.data.lastScrollTop) {
      this.setData({ isUserScrolling: true });
    } else if (isAtBottom) {
      // 如果滚动到底部，重置用户滚动标志
      this.setData({ isUserScrolling: false });
    }

    // 更新悬浮按钮显示状态
    this.setData({
      showScrollToBottomBtn: !isAtBottom,
      lastScrollTop: scrollTop
    });
  },

  // 滚动到底部
  scrollToBottom() {
    this.setData({
      scrollTop: 999999,
      isUserScrolling: false,
      showScrollToBottomBtn: false
    });
  },

  // 触发滚动到底部（新消息到达时调用）
  triggerScrollToBottom() {
    if (!this.data.isUserScrolling) {
      this.scrollToBottom();
    } else {
      // 如果用户正在滚动，显示悬浮按钮提示有新消息
      this.setData({ showScrollToBottomBtn: true });
    }
  },

  changeisexpanded() {
    this.setData({
      isexpanded: !this.data.isexpanded
    });
  },

  change_history_isexpanded(e) {
    const targetIndex = e.currentTarget.dataset.index;
    const newChatMessages = [...this.data.chatMessages];
    newChatMessages[targetIndex] = {
      ...newChatMessages[targetIndex],
      history_isexpanded: !newChatMessages[targetIndex].history_isexpanded
    };
    this.setData({ chatMessages: newChatMessages });
  },

  copyMessage(e) {
    const content = e.currentTarget.dataset.content;
    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success'
        });
      }
    });
  },

  // ==================== 历史记录相关方法 ====================

  // 从本地存储加载聊天历史
  loadChatHistory() {
    try {
      const history = wx.getStorageSync('gameChatHistory');
      if (history) {
        this.setData({ chatHistory: history });
      }
    } catch (e) {
      this.addLog('error', `加载历史记录失败: ${e.message}`);
    }
  },

  // 保存聊天历史到本地存储
  saveChatHistory() {
    try {
      if (this.data.chatMessages.length === 0) return;

      const conversationId = this.data.conversation_id || 'default';

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
        agentName: '是或不是游戏',
        agentId: this.data.agent_id,
        preview: preview,
        messages: this.data.chatMessages,
        gameMode: this.data.gameMode, // 保存游戏模式
        timestamp: new Date().getTime(),
        timeString: new Date().toLocaleString()
      };

      let history = this.data.chatHistory || [];

      // 查找是否已存在相同会话ID的记录
      const existingIndex = history.findIndex(item => item.conversationId === conversationId);

      if (existingIndex !== -1) {
        history[existingIndex] = historyItem;
        history.splice(existingIndex, 1);
        history.unshift(historyItem);
      } else {
        history.unshift(historyItem);
      }

      // 按时间戳排序
      history.sort((a, b) => b.timestamp - a.timestamp);

      // 限制历史记录数量
      if (history.length > 50) {
        history = history.slice(0, 50);
      }

      this.setData({ chatHistory: history });
      wx.setStorageSync('gameChatHistory', history);
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
      // 根据游戏模式设置UI状态
      let inputAreaDisabled = false;
      let showAnswerButtons = false;

      if (historyItem.gameMode === 'answer') {
        // AI猜谜模式：隐藏输入框，显示答题按钮
        inputAreaDisabled = true;
        showAnswerButtons = true;
      } else if (historyItem.gameMode === 'guess') {
        // 玩家猜谜模式：显示输入框
        inputAreaDisabled = false;
        showAnswerButtons = false;
      }

      this.setData({
        chatMessages: historyItem.messages,
        agent_id: historyItem.agentId,
        conversation_id: historyItem.conversationId,
        gameMode: historyItem.gameMode || '',
        inputAreaDisabled: inputAreaDisabled,
        showAnswerButtons: showAnswerButtons,
        showHistoryPanel: false,
        isReceivingDone: true
      });

      const modeText = historyItem.gameMode === 'guess' ? '我来猜' : '答题';
      wx.showToast({
        title: `已加载历史记录 (${modeText}模式)`,
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
          wx.setStorageSync('gameChatHistory', history);
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
      title: '开启新对话',
      content: '你将离开该对话，该对话已保存到历史',
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
            conversation_id: false,
            gameMode: '',
            inputAreaDisabled: false,
            showAnswerButtons: false
          });
          wx.showToast({
            title: '已开启新对话',
            icon: 'success'
          });
        }
      }
    });
  },

  // ==================== 头像相关方法 ====================

  // 更新当前头像
  updateCurrentAvatar() {
    const avatarKey = 'game_avatar';
    const avatar = wx.getStorageSync(avatarKey) || '';
    this.setData({ currentAvatar: avatar });
  },

  // 选择头像
  chooseAvatar() {
    this.setData({
      avatarCurrentPage: 1,
      avatarPageSize: 10
    });
    this.updateDisplayedAvatars();
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

    const avatarList = this.data.avatarList || [];
    const displayed = avatarList.slice(startIndex, endIndex);
    const hasMore = endIndex < avatarList.length;

    this.setData({
      displayedAvatars: displayed,
      hasMoreAvatars: hasMore
    });
  },

  // 显示更多头像
  showMoreAvatars() {
    const currentPage = this.data.avatarCurrentPage;
    this.setData({
      avatarCurrentPage: currentPage + 1,
      avatarPageSize: 10
    });
    this.updateDisplayedAvatars();
  },

  // 选择头像
  selectAvatar(e) {
    const selectedPath = e.currentTarget.dataset.path;

    this.setData({
      currentAvatar: selectedPath,
      showAvatarModal: false
    });

    // 保存到本地存储
    wx.setStorageSync('game_avatar', selectedPath);

    wx.showToast({
      title: '头像已更新',
      icon: 'success'
    });
  },

  // 从本地存储加载头像列表
  loadAvatarList() {
    try {
      const customAvatars = wx.getStorageSync('gameCustomAvatars') || [];
      const ossUrl = getApp().globalData.oss_url;

      const defaultAvatarFiles = [
        { name: '狗律师', fileName: '狗律师.webp' },
        { name: '猫律师', fileName: '猫律师.webp' },
        { name: '鳄鱼', fileName: '鳄鱼.webp' },
        { name: '伤心猫', fileName: '伤心猫.jpg' },
        { name: '化妆猫', fileName: '化妆猫.jpeg' },
        { name: '原神哪吒', fileName: '原神哪吒.jpg' },
        { name: '反恐精英', fileName: '反恐精英.png' },
        { name: '唐猫', fileName: '唐猫.jpeg' },
        { name: '女仆猫', fileName: '女仆猫.jpeg' },
        { name: '恩情', fileName: '恩情.gif' },
        { name: '意林', fileName: '意林.png' },
        { name: '指挥官', fileName: '指挥官.png' },
        { name: '敦煌狗', fileName: '敦煌狗.png' },
        { name: '旋转猫', fileName: '旋转猫.jpg' },
        { name: '林2猫', fileName: '林2猫.jpeg' },
        { name: '溃军', fileName: '溃军.jpeg' },
        { name: '牛1', fileName: '牛1.png' },
        { name: '特朗普', fileName: '特朗普.png' },
        { name: '狼', fileName: '狼.png' },
        { name: '猫仙人', fileName: '猫仙人.png' },
        { name: '猴', fileName: '猴.jpeg' },
        { name: '睡狗', fileName: '睡狗.png' },
        { name: '福建人', fileName: '福建人.jpeg' },
        { name: '老家狗', fileName: '老家狗.jpg' },
        { name: '老家白狗', fileName: '老家白狗.jpg' },
        { name: '老黄', fileName: '老黄.jpg' },
        { name: '耄耋彪', fileName: '耄耋彪.jpg' },
        { name: '耄耋连招', fileName: '耄耋连招.gif' },
        { name: '耄耋震惊', fileName: '耄耋震惊.jpeg' },
        { name: '钓鱼', fileName: '钓鱼.jpeg' },
        { name: '难掩笑容', fileName: '难掩笑容.jpeg' },
        { name: '高清快乐耄耋', fileName: '高清快乐耄耋.jpeg' }
      ];

      const defaultAvatars = defaultAvatarFiles.map(item => {
        const encodedFileName = encodeURIComponent(item.fileName);
        return {
          name: item.name,
          path: ossUrl + encodedFileName,
          isCustom: false
        };
      });

      const avatarList = [...defaultAvatars, ...customAvatars];
      this.setData({ avatarList: avatarList });
    } catch (e) {
      this.addLog('error', `加载头像列表失败: ${e.message}`);
    }
  },

  // 保存头像列表到本地存储
  saveAvatarList() {
    try {
      const customAvatars = this.data.avatarList.filter(avatar => avatar.isCustom);
      wx.setStorageSync('gameCustomAvatars', customAvatars);
    } catch (e) {
      this.addLog('error', `保存头像列表失败: ${e.message}`);
    }
  },

  // 上传新头像
  uploadAvatar() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;

        wx.getImageInfo({
          src: tempFilePath,
          success: (imgInfo) => {
            const timestamp = Date.now();
            const fileName = `avatar_${timestamp}.jpg`;

            const fsm = wx.getFileSystemManager();
            const savedFilePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

            try {
              fsm.copyFileSync(tempFilePath, savedFilePath);

              const newAvatar = {
                name: `自定义${timestamp}`,
                path: savedFilePath,
                isCustom: true
              };

              const updatedList = [...that.data.avatarList, newAvatar];
              that.setData({
                avatarList: updatedList
              });

              that.saveAvatarList();
              that.updateDisplayedAvatars();

              that.setData({
                currentAvatar: savedFilePath
              });
              wx.setStorageSync('game_avatar', savedFilePath);

              wx.showToast({
                title: '头像已上传并设置',
                icon: 'success'
              });
            } catch (err) {
              that.addLog('error', `保存图片失败: ${err.message}`);
              wx.showToast({
                title: '保存图片失败',
                icon: 'none'
              });
            }
          },
          fail: (err) => {
            that.addLog('error', `获取图片信息失败: ${err.errMsg}`);
          }
        });
      },
      fail: (err) => {
        that.addLog('error', `选择图片失败: ${err.errMsg}`);
      }
    });
  },

  // 删除自定义头像
  deleteCustomAvatar(e) {
    const index = e.currentTarget.dataset.index;
    const avatar = this.data.avatarList[index];

    if (!avatar.isCustom) {
      wx.showToast({
        title: '无法删除默认头像',
        icon: 'none'
      });
      return;
    }

    const that = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个自定义头像吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            const fsm = wx.getFileSystemManager();
            fsm.unlinkSync(avatar.path);

            const updatedList = that.data.avatarList.filter((_, i) => i !== index);
            that.setData({ avatarList: updatedList });
            that.saveAvatarList();
            that.updateDisplayedAvatars();

            wx.showToast({
              title: '已删除',
              icon: 'success'
            });
          } catch (err) {
            that.addLog('error', `删除图片失败: ${err.message}`);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 空函数，用于阻止点击事件冒泡
  }
});
