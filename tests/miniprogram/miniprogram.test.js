const assert = require("node:assert/strict");
const test = require("node:test");
const { createKnowledgeFromURL, knowledgeChat, listKnowledgeBases } = require("../../miniprogram/utils/request");
const { collectAnswerFromSSE, parseSSE } = require("../../miniprogram/utils/sse");
const { normalizeBaseUrl } = require("../../miniprogram/utils/config");

test("parseSSE extracts event payloads", () => {
  const events = parseSSE('event: message\ndata: {"content":"hi"}\n\n');

  assert.equal(events.length, 1);
  assert.equal(events[0].event, "message");
  assert.equal(events[0].data, '{"content":"hi"}');
});

test("collectAnswerFromSSE joins answer chunks and skips references", () => {
  const raw = [
    'event: message\ndata: {"response_type":"references","content":"skip","done":false}',
    'event: message\ndata: {"response_type":"answer","content":"Hel","done":false}',
    'event: message\ndata: {"response_type":"answer","content":"lo","done":true}'
  ].join("\n\n");

  assert.equal(collectAnswerFromSSE(raw), "Hello");
});

test("collectAnswerFromSSE removes inline thinking after joining chunks", () => {
  const cases = [
    { chunks: ["普通回答"], expected: "普通回答" },
    { chunks: ["<think>分析\n检索</think>\n正式回答"], expected: "正式回答" },
    { chunks: ["<thi", "nk>分析</thi", "nk>正式回答"], expected: "正式回答" },
    { chunks: ["正式回答<think>未完成的思考"], expected: "正式回答" },
    { chunks: ["<think>只有思考"], expected: "" },
    { chunks: ["<think>思考一</think>答案一<think>思考二</think>答案二"], expected: "答案一答案二" }
  ];

  for (const { chunks, expected } of cases) {
    const raw = chunks.map((content) =>
      `event: message\ndata: ${JSON.stringify({ response_type: "answer", content })}`
    ).join("\n\n");
    assert.equal(collectAnswerFromSSE(raw), expected, JSON.stringify(chunks));
  }
});

test("chat page keeps raw responses for diagnosis and filters displayed answers", async () => {
  const originalPage = global.Page;
  const originalWx = global.wx;
  let definition;
  let rawResponse;
  try {
    global.Page = (page) => { definition = page; };
    global.wx = {
      getStorageSync() {
        return { baseUrl: "https://weknora.example.com", apiKey: "sk-test" };
      },
      request(options) {
        options.success({ statusCode: 200, data: rawResponse });
      }
    };
    delete require.cache[require.resolve("../../miniprogram/pages/chat/chat.js")];
    require("../../miniprogram/pages/chat/chat.js");

    for (const [content, expected] of [
      ["<think>分析</think>正式回答", "正式回答"],
      ["<think>未完成的思考", ""]
    ]) {
      rawResponse = `event: message\ndata: ${JSON.stringify({ response_type: "answer", content })}\n\n`;
      const page = {
        data: { ...definition.data, query: "测试问题" },
        async ensureSession() { return "session-test"; },
        setData(nextData) { this.data = { ...this.data, ...nextData }; }
      };
      await definition.ask.call(page);
      assert.equal(page.data.answer, expected);
      assert.equal(page.data.rawResponse, rawResponse);
      assert.equal(page.data.loading, false);
    }
  } finally {
    global.Page = originalPage;
    global.wx = originalWx;
  }
});

test("normalizeBaseUrl trims trailing slashes", () => {
  assert.equal(normalizeBaseUrl(" https://example.com/// "), "https://example.com");
});

test("API helpers send WeKnora auth headers", async () => {
  let capturedRequest;
  global.wx = {
    getStorageSync() {
      return {
        apiKey: "sk-test",
        baseUrl: "https://weknora.example.com/",
        selectedKnowledgeBaseId: "kb-1"
      };
    },
    request(options) {
      capturedRequest = options;
      options.success({
        statusCode: 200,
        data: {
          data: []
        }
      });
    }
  };

  await listKnowledgeBases();

  assert.equal(capturedRequest.url, "https://weknora.example.com/api/v1/knowledge-bases");
  assert.equal(capturedRequest.header["X-API-Key"], "sk-test");
  assert.match(capturedRequest.header["X-Request-ID"], /^mp-/);
});

test("URL import helper posts the selected URL payload", async () => {
  let capturedRequest;
  global.wx = {
    getStorageSync() {
      return {
        apiKey: "sk-test",
        baseUrl: "https://weknora.example.com",
        selectedKnowledgeBaseId: "kb-1"
      };
    },
    request(options) {
      capturedRequest = options;
      options.success({
        statusCode: 201,
        data: {
          success: true
        }
      });
    }
  };

  await createKnowledgeFromURL("kb-1", "https://github.com/Tencent/WeKnora", true);

  assert.equal(capturedRequest.method, "POST");
  assert.equal(capturedRequest.url, "https://weknora.example.com/api/v1/knowledge-bases/kb-1/knowledge/url");
  assert.deepEqual(capturedRequest.data, {
    url: "https://github.com/Tencent/WeKnora",
    enable_multimodel: true
  });
});

test("API helpers explain invalid API keys without exposing the key", async () => {
  const originalWx = global.wx;
  try {
    global.wx = {
      getStorageSync() {
        return { baseUrl: "https://weknora.example.com", apiKey: "sk-invalid-test" };
      },
      request(options) {
        options.success({
          statusCode: 401,
          data: { error: "Unauthorized: invalid API key" }
        });
      }
    };
    await assert.rejects(listKnowledgeBases(), {
      message: "API 密钥无效或已失效，请在设置中更新此后端的工作区 API 密钥。"
    });
  } finally {
    global.wx = originalWx;
  }
});

test("API helpers preserve string error responses from the backend", async () => {
  const originalWx = global.wx;
  try {
    global.wx = {
      getStorageSync() {
        return { baseUrl: "https://weknora.example.com", apiKey: "sk-test" };
      },
      request(options) {
        options.success({
          statusCode: 401,
          data: { error: "Unauthorized: missing authentication" }
        });
      }
    };
    await assert.rejects(listKnowledgeBases(), {
      message: "Unauthorized: missing authentication"
    });
  } finally {
    global.wx = originalWx;
  }
});

test("chat helper includes selected knowledge base ids", async () => {
  let capturedRequest;
  global.wx = {
    getStorageSync() {
      return {
        apiKey: "sk-test",
        baseUrl: "https://weknora.example.com"
      };
    },
    request(options) {
      capturedRequest = options;
      options.success({
        statusCode: 200,
        data: "event: message\ndata: {}\n\n"
      });
    }
  };

  await knowledgeChat("session-1", "hello", "kb-1");

  assert.equal(capturedRequest.method, "POST");
  assert.equal(capturedRequest.url, "https://weknora.example.com/api/v1/knowledge-chat/session-1");
  assert.deepEqual(capturedRequest.data, {
    query: "hello",
    knowledge_base_ids: ["kb-1"]
  });
});

test("knowledge page skips API loading until settings are configured", async () => {
  const calls = [];
  const pageDefinitions = [];
  const originalPage = global.Page;
  const originalWx = global.wx;

  try {
    global.Page = (definition) => {
      pageDefinitions.push(definition);
    };
    global.wx = {
      getStorageSync() {
        return {};
      },
      request() {
        calls.push("request");
      },
      switchTab() {}
    };

    delete require.cache[require.resolve("../../miniprogram/pages/index/index.js")];
    require("../../miniprogram/pages/index/index.js");
    const page = {
      data: { ...pageDefinitions[0].data },
      setData(nextData) {
        this.data = { ...this.data, ...nextData };
      }
    };

    await pageDefinitions[0].onShow.call(page);

    assert.equal(page.data.needsSettings, true);
    assert.deepEqual(calls, []);
  } finally {
    global.Page = originalPage;
    global.wx = originalWx;
  }
});

test("knowledge page maps API results to picker labels", async () => {
  const pageDefinitions = [];
  const originalPage = global.Page;
  const originalWx = global.wx;
  let savedSettings;

  try {
    global.Page = (definition) => {
      pageDefinitions.push(definition);
    };
    global.wx = {
      getStorageSync() {
        return {
          apiKey: "sk-test",
          baseUrl: "https://weknora.example.com"
        };
      },
      request(options) {
        options.success({
          statusCode: 200,
          data: {
            data: [
              { id: "kb-1", name: "Compliance KB" },
              { id: "kb-2", name: "Docs KB" }
            ]
          }
        });
      },
      setStorageSync(key, value) {
        savedSettings = { key, value };
      },
      switchTab() {}
    };

    delete require.cache[require.resolve("../../miniprogram/pages/index/index.js")];
    require("../../miniprogram/pages/index/index.js");
    const page = {
      data: { ...pageDefinitions[0].data },
      setData(nextData) {
        this.data = { ...this.data, ...nextData };
      }
    };

    await pageDefinitions[0].loadKnowledgeBases.call(page);

    assert.deepEqual(page.data.knowledgeBaseNames, ["Compliance KB", "Docs KB"]);
    assert.equal(page.data.selectedKnowledgeBaseId, "kb-1");
    assert.equal(page.data.selectedKnowledgeBaseName, "Compliance KB");
    assert.equal(savedSettings.value.selectedKnowledgeBaseId, "kb-1");
  } finally {
    global.Page = originalPage;
    global.wx = originalWx;
  }
});
