Page({
  data: {
    apiData: '点击下方按钮获取数据'
  },
  goToAbout() {
    wx.navigateTo({
      url: '/pages/GEO/GEO'
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
  }
})


