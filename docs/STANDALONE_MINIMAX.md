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

`config/builtin_models.yaml` 将 MiniMax 设为默认对话模型，将本机 Ollama 的 `bge-m3` 设为默认向量模型，并登记 `qwen2.5vl:3b` 作为扫描文档的视觉模型。启动前须在运行 Ollama 的机器上准备好这些模型：

```sh
ollama pull bge-m3
ollama pull qwen2.5vl:3b
```

随后按照上游部署文档启动 WeKnora。视觉模型约需 3.2 GB 下载空间。部署到服务器时，模型下载到运行 Ollama 的服务器，不会下载到网站访问者设备。

`docker-compose.yml` 中 `api.minimaxi.com` 的固定地址只用于绕过当前机器代理 DNS 返回的保留地址；公网 IP 变化后需重新核实，不能把它当作长期有效的地址。

本机代理如果把微信 iLink 域名解析到 `198.18.0.0/15` fake-IP，微信扫码绑定会被 WeKnora 的 SSRF 检查拒绝。此时在本地 `.env` 中仅增加微信接口域名（保留 Compose 默认的服务名）：

```dotenv
SSRF_WHITELIST_EXTRA=searxng,qdrant,milvus,weaviate,doris-fe,doris-be,minio,ilinkai.weixin.qq.com
```

重建 `app` 容器后再生成二维码。不要把整个 `198.18.0.0/15` 网段加入白名单；若可调整代理 DNS，也可对该域名返回真实 IP。

## 界面设置与验收

在 WeKnora 界面中创建知识库、上传资料，并确认“快速问答”的对话模型已选择 MiniMax。可上传 `website-docs/sample-data/weknora-kb-acceptance-sample.md` 测试事实、条件、例外和资料未覆盖时的回答。

扫描版 PDF 没有可直接提取的文字。上传前在知识库设置 → 图像处理启用多模态并选择 `qwen2.5vl:3b`；已上传的文件还须在“重建知识”的图像处理配置中开启多模态并选择该模型，重新解析后检查分块中是否出现真实文字。仅显示“解析完成”不足以证明扫描文字已入库。

知识库、智能体模型绑定及上传资料保存在数据库和存储卷里，Git 只保存上述可复用配置与示例资料。重新部署后，需要在界面中核对这些设置。

默认未配置网络搜索服务商。模型可能根据自身知识回答资料未覆盖的问题；这种回答不代表知识库命中或实时联网检索。
