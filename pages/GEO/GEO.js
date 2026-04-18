// pages/GEO/GEO.js

Page({
  data: {
    // 连接状态
    isConnected: false,
    isexpanded: true,
    serverUrl: "",
    // 微信云托管
    // "wss://geo-mini-backend-prod-8g52b3gg19eac702-1314260299.ap-shanghai.run.wxcloudrun.com"

    // 1. 滚动轮盘的预设选项（自定义名字+对应ID，可根据需求扩展）
    workflowList: [
      { name: "GEO", id: "7566453172001554438" },
      { name: "测试", id: "7552729187959636003" },
      { name: "风险评估", id: "7589488104442462249" },
      { name: "娱乐游戏", id: "7589529923770056756" }
    ],
    workflowNameList: [],
    // 2. 选中的轮盘选项索引（默认选第一个）
    selectedIndex: 0,
    workflow_id: '7552729187959636003',
    conversation_id: false,
    user_id: "101",
    // 7552729187959636003 测试工作流ID
    // 7566453172001554438 GEO先锋测试

    // 消息
    message: '你好',
    inputMessage: '', // 新增：聊天输入框的消息
    receivedData: '',
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

    // 滚动跟踪相关
    showScrollToBottomBtn: false,
    isUserScrolling: false,
    lastScrollTop: 0,
    scrollThreshold: 50, // 距离底部多少像素时显示按钮

    // 历史记录相关
    showHistoryPanel: false,
    chatHistory: [],

    // 头像相关
    currentAvatar: '',
    avatarMapping: {},
    showAvatarModal: false,
    displayedAvatars: [],
    hasMoreAvatars: false,
    avatarPageSize: 10,
    avatarCurrentPage: 1,

    // 选择器弹窗
    showPickerModal: false
  },

  // 可选头像列表（从存储中动态加载）
  avatarList: [],

  onLoad() {
    this.addLog('info', '页面加载完成');
    const websocket_url =getApp().globalData.websocket_url;
    this.setData({
      serverUrl :websocket_url
    });
    this.connectWebSocket();
    const workflowNameList = this.data.workflowList.map(item => item.name);
    this.setData({
      workflowNameList: workflowNameList,
      // 初始化输入框为第一个工作流的 ID
      workflow_id: this.data.workflowList[0].id
    });
    this.loadChatHistory();
    this.loadAvatarMapping();
    this.loadAvatarList();
    this.updateCurrentAvatar();
  },

  // 加载头像映射
  loadAvatarMapping() {
    try {
      const mapping = wx.getStorageSync('geoAvatarMapping') || {};
      this.setData({ avatarMapping: mapping });
    } catch (e) {
      this.addLog('error', `加载头像映射失败: ${e.message}`);
    }
  },

  // 保存头像映射
  saveAvatarMapping() {
    try {
      wx.setStorageSync('geoAvatarMapping', this.data.avatarMapping);
    } catch (e) {
      this.addLog('error', `保存头像映射失败: ${e.message}`);
    }
  },

  // 更新当前头像
  updateCurrentAvatar() {
    const workflowId = this.data.workflow_id;
    const avatar = this.data.avatarMapping[workflowId] || '';
    this.setData({ currentAvatar: avatar });
  },

  // 选择头像
  chooseAvatar() {
    // 重置分页
    this.setData({
      avatarCurrentPage: 1,
      avatarPageSize: 10
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

    const avatarList = this.data.avatarList || [];
    const displayed = avatarList.slice(startIndex, endIndex);
    const hasMore = endIndex < avatarList.length;

    this.setData({
      displayedAvatars: displayed,
      hasMoreAvatars: hasMore
    });
  },

  // 显示更多头像（每页10个）
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
    const workflowId = this.data.workflow_id;

    // 更新映射
    const mapping = this.data.avatarMapping;
    mapping[workflowId] = selectedPath;

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

  // 从本地存储加载头像列表
  loadAvatarList() {
    try {
      // 从缓存加载用户自定义头像
      const customAvatars = wx.getStorageSync('geoCustomAvatars') || [];

      // 获取 OSS URL
      const ossUrl = getApp().globalData.oss_url;

      // 默认头像文件名列表（保留原有）
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
        { name: '搜图神器', fileName: '搜图神器_1742820321018.png' },
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

      // 将文件名转换为 UTF-8 编码并拼接 OSS URL
      const defaultAvatars = defaultAvatarFiles.map(item => {
        const encodedFileName = encodeURIComponent(item.fileName);
        return {
          name: item.name,
          path: ossUrl + encodedFileName,
          isCustom: false
        };
      });

      // 合并默认头像和自定义头像
      const avatarList = [...defaultAvatars, ...customAvatars];
      this.setData({ avatarList: avatarList });
    } catch (e) {
      this.addLog('error', `加载头像列表失败: ${e.message}`);
    }
  },

  // 保存头像列表到本地存储（仅保存自定义头像）
  saveAvatarList() {
    try {
      const customAvatars = this.data.avatarList.filter(avatar => avatar.isCustom);
      wx.setStorageSync('geoCustomAvatars', customAvatars);
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

        // 获取图片信息
        wx.getImageInfo({
          src: tempFilePath,
          success: (imgInfo) => {
            // 生成唯一文件名
            const timestamp = Date.now();
            const fileName = `avatar_${timestamp}.jpg`;

            // 使用文件系统管理器保存图片
            const fsm = wx.getFileSystemManager();
            const savedFilePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

            try {
              // 复制临时文件到用户数据目录
              fsm.copyFileSync(tempFilePath, savedFilePath);

              // 添加到头像列表
              const newAvatar = {
                name: `自定义${timestamp}`,
                path: savedFilePath,
                isCustom: true
              };

              const updatedList = [...that.data.avatarList, newAvatar];
              that.setData({
                avatarList: updatedList
              });

              // 保存到本地存储（仅自定义头像）
              that.saveAvatarList();
              that.updateDisplayedAvatars();

              // 自动选择新上传的头像
              const workflowId = that.data.workflow_id;
              const mapping = that.data.avatarMapping;
              mapping[workflowId] = savedFilePath;

              that.setData({
                avatarMapping: mapping,
                currentAvatar: savedFilePath
              });
              that.saveAvatarMapping();

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

    // 只允许删除自定义头像
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
            // 从文件系统中删除
            const fsm = wx.getFileSystemManager();
            fsm.unlinkSync(avatar.path);

            // 从列表中删除
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
    const selectedItem = this.data.workflowList[selectedIndex];
    this.setData({
      selectedIndex: selectedIndex,
      workflow_id: selectedItem.id
    });
    this.updateCurrentAvatar();
  },

  // 显示工作流选择器
  showWorkflowPicker() {
    this.setData({
      showPickerModal: true
    });
  },

  // 隐藏工作流选择器
  hidePickerModal() {
    this.setData({
      showPickerModal: false
    });
  },

  // 选择工作流
  selectWorkflow(e) {
    const index = e.currentTarget.dataset.index;
    const selectedItem = this.data.workflowList[index];

    this.setData({
      selectedIndex: index,
      workflow_id: selectedItem.id,
      showPickerModal: false
    });

    this.updateCurrentAvatar();

    wx.showToast({
      title: `已选择：${selectedItem.name}`,
      icon: 'success'
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

  // 从本地存储加载聊天历史
  loadChatHistory() {
    try {
      const history = wx.getStorageSync('geoChatHistory');
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
      const workflowItem = this.data.workflowList[this.data.selectedIndex] || { name: '未知', id: '' };

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
        workflowName: workflowItem.name,
        workflowId: this.data.workflow_id,
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
      wx.setStorageSync('geoChatHistory', history);
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
        workflow_id: historyItem.workflowId,
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
          wx.setStorageSync('geoChatHistory', history);
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
            conversation_id: false
          });
          wx.showToast({
            title: '已开启新对话',
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
              resultdata: '' // 清空临时接收数据
            });
            this.saveChatHistory();
            // 新消息到达，触发滚动
            this.triggerScrollToBottom();
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
          this.setData({
            receivedData: this.data.receivedData + content
          });
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
          // 接收流式数据时触发滚动
          this.triggerScrollToBottom();
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

    // 使用新的输入框内容，如果为空则使用旧的消息字段
    const message = this.data.inputMessage.trim() || this.data.message.trim();
    if (!message) {
      wx.showToast({
        title: '消息不能为空',
        icon: 'none'
      });
      return;
    }

    const workflow_ID = this.data.workflow_id.trim();
    const data = {
      task: message,
      workflow_id: workflow_ID,
      conversation_id: this.data.conversation_id,
      user_id: this.data.user_id
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