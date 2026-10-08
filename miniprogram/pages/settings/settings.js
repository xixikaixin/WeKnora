const { getSettings, saveSettings } = require("../../utils/config");

Page({
  data: {
    baseUrl: "http://139.196.32.95:8000",
    apiKey: "sk-ws-H.PLYLLMD.0OF5.MEUCIFf1ol8jVuqU3XjFkav2KuN90sUwqp3-fCn67EkyDv5EAiEArfmjrO9U7ZCbxufc4sYndsF5V7ObazzWE8GIWtZ1DTM"
  },

  onShow() {
    const settings = getSettings();
    this.setData({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey
    });
  },

  onBaseUrlInput(event) {
    this.setData({ baseUrl: event.detail.value });
  },

  onApiKeyInput(event) {
    this.setData({ apiKey: event.detail.value });
  },

  save() {
    saveSettings({
      baseUrl: this.data.baseUrl,
      apiKey: this.data.apiKey
    });
    wx.showToast({ title: "已保存", icon: "success" });
  }
});
