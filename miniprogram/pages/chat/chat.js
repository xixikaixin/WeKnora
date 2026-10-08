const { getSettings } = require("../../utils/config");
const { createSession, knowledgeChat } = require("../../utils/request");
const { collectAnswerFromSSE } = require("../../utils/sse");

Page({
  data: {
    answer: "",
    loading: false,
    query: "",
    rawResponse: "",
    sessionId: ""
  },

  onQueryInput(event) {
    this.setData({ query: event.detail.value });
  },

  async ensureSession() {
    if (this.data.sessionId) {
      return this.data.sessionId;
    }

    const settings = getSettings();
    const response = await createSession(settings.selectedKnowledgeBaseId);
    const sessionId = response.data?.id;
    if (!sessionId) {
      throw new Error("创建会话失败：接口未返回会话 ID。");
    }
    this.setData({ sessionId });
    return sessionId;
  },

  async ask() {
    this.setData({ answer: "", rawResponse: "", loading: true });
    try {
      const sessionId = await this.ensureSession();
      const settings = getSettings();
      const response = await knowledgeChat(sessionId, this.data.query.trim(), settings.selectedKnowledgeBaseId);
      const rawResponse = typeof response === "string" ? response : JSON.stringify(response);
      const answer = collectAnswerFromSSE(rawResponse);
      this.setData({
        answer,
        rawResponse
      });
    } catch (error) {
      wx.showModal({
        title: "问答失败",
        content: error.message,
        confirmText: "确定",
        showCancel: false
      });
    } finally {
      this.setData({ loading: false });
    }
  }
});
