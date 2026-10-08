const { getSettings } = require("./config");

function request(path, options = {}) {
  const settings = getSettings();
  if (!settings.baseUrl) {
    return Promise.reject(new Error("请先配置 WeKnora 后端地址。"));
  }
  if (!settings.apiKey) {
    return Promise.reject(new Error("请先配置 WeKnora API 密钥。"));
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${settings.baseUrl}${path}`,
      method: options.method || "GET",
      data: options.data,
      header: {
        "Content-Type": "application/json",
        "X-API-Key": settings.apiKey,
        "X-Request-ID": `mp-${Date.now()}-${Math.random().toString(16).slice(2)}`
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data);
          return;
        }
        const serverError = response.data?.error;
        const message = (typeof serverError === "string" ? serverError : serverError?.message)
          || response.data?.message || `HTTP ${response.statusCode}`;
        if (message === "Unauthorized: invalid API key") {
          reject(new Error("API 密钥无效或已失效，请在设置中更新此后端的工作区 API 密钥。"));
          return;
        }
        reject(new Error(message));
      },
      fail(error) {
        reject(new Error(error.errMsg || "网络请求失败。"));
      }
    });
  });
}

function listKnowledgeBases() {
  return request("/api/v1/knowledge-bases");
}

function createKnowledgeFromURL(knowledgeBaseId, url, enableMultimodel = false) {
  return request(`/api/v1/knowledge-bases/${knowledgeBaseId}/knowledge/url`, {
    method: "POST",
    data: {
      url,
      enable_multimodel: enableMultimodel
    }
  });
}

function createSession(knowledgeBaseId) {
  return request("/api/v1/sessions", {
    method: "POST",
    data: knowledgeBaseId ? { knowledge_base_id: knowledgeBaseId } : {}
  });
}

function knowledgeChat(sessionId, query, knowledgeBaseId) {
  const data = { query };
  if (knowledgeBaseId) {
    data.knowledge_base_ids = [knowledgeBaseId];
  }

  return request(`/api/v1/knowledge-chat/${sessionId}`, {
    method: "POST",
    data
  });
}

module.exports = {
  createKnowledgeFromURL,
  createSession,
  knowledgeChat,
  listKnowledgeBases,
  request
};
