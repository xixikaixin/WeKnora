# 独立 WeKnora：MiniMax 与知识库体验

此配置用于独立运行 WeKnora v0.8.0，不依赖其他项目。资料管理、检索与问答均在 WeKnora 界面完成。

## 启动配置

以仓库的 `.env.example` 为基础创建本地 `.env`，并设置：

```dotenv
WEKNORA_VERSION=v0.8.0
MINIMAX_MODEL=MiniMax-M2.7-highspeed
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
MINIMAX_API_KEY=请填写自己的密钥
```

`config/builtin_models.yaml` 将 MiniMax 设为默认对话模型，将本机 Ollama 的 `bge-m3` 设为默认向量模型。启动前须在本机准备好 Ollama 与 `bge-m3`，然后按照上游部署文档启动 WeKnora。

`docker-compose.yml` 中 `api.minimaxi.com` 的固定地址只用于绕过当前机器代理 DNS 返回的保留地址；公网 IP 变化后需重新核实，不能把它当作长期有效的地址。

## 界面设置与验收

在 WeKnora 界面中创建知识库、上传资料，并确认“快速问答”的对话模型已选择 MiniMax。可上传 `website-docs/sample-data/weknora-kb-acceptance-sample.md` 测试事实、条件、例外和资料未覆盖时的回答。

知识库、智能体模型绑定及上传资料保存在数据库和存储卷里，Git 只保存上述可复用配置与示例资料。重新部署后，需要在界面中核对这些设置。

默认未配置网络搜索服务商。模型可能根据自身知识回答资料未覆盖的问题；这种回答不代表知识库命中或实时联网检索。
