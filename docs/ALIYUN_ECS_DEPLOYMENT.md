# 阿里云 ECS 部署独立 WeKnora（在线模型）

适用仓库：`git@codeup.aliyun.com:5fd336dac9b6991721d68f21/weknora.git` 的 `master` 分支。本文按**全新部署、不迁移本机数据**编写，使用 WeKnora 的界面管理资料和问答，不接入 realtime-speech。

## 部署方案

WeKnora 在 ECS 上运行，聊天使用 MiniMax API，向量化和图片理解使用阿里云百炼模型 API。不安装 Ollama，服务器不下载模型。PostgreSQL 和文件卷由 ECS 保存。模型配置方式见 [WeKnora 模型管理](https://github.com/Tencent/WeKnora/blob/main/website-docs/03-features/06-models.md)。

## 1. 准备服务器和域名

- 建议先用一台 Ubuntu 24.04、x86-64 ECS，**4 核 / 8 GB 内存起步**，云盘按资料量预留；这是小规模体验配置，实际并发与解析速度须验收。
- 安装 Git、Docker Engine 和 Docker Compose 插件，按 [Docker 官方 Ubuntu 安装文档](https://docs.docker.com/engine/install/ubuntu/)操作。
- 为 ECS 配置该 Codeup 仓库的只读 SSH 访问；如果改用 HTTPS 克隆，则换用 Codeup 提供的 HTTPS 地址和相应凭证。
- 准备指向 ECS 公网 IP 的域名。安全组仅向公网开放 80/443；22 限定管理者 IP。8080、8081、5432、6379、11434 不向公网开放。[阿里云安全组说明](https://help.aliyun.com/zh/ecs/user-guide/start-using-security-groups)
- 如果 ECS 位于中国内地且网站要对外提供访问，先办理所需 ICP 备案。[阿里云备案说明](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)
- 确认服务器能访问 Codeup、Docker 镜像仓库、MiniMax 和百炼 API。生产部署使用实际 DNS，不沿用本机代理的固定 MiniMax IP。

以下命令在 ECS 上执行；`kb.example.com` 需换成自己的域名。

## 2. 获取代码并准备环境变量

```bash
git clone -b master git@codeup.aliyun.com:5fd336dac9b6991721d68f21/weknora.git
cd weknora
umask 077
cp .env.example .env
```

编辑 `.env`，至少核对以下值：

```dotenv
WEKNORA_VERSION=v0.8.0
GIN_MODE=release
WEKNORA_LANGUAGE=zh-CN
DEFAULT_LOCALE=zh-CN
RETRIEVE_DRIVER=postgres
STORAGE_TYPE=local
OLLAMA_OPTIONAL=true
FRONTEND_PORT=127.0.0.1:8081
APP_PORT=127.0.0.1:8080
FRONTEND_BASE_URL=https://kb.example.com
DISABLE_REGISTRATION=false
LANGFUSE_ENABLED=false
DB_PASSWORD=换成独立的随机密码
REDIS_PASSWORD=换成独立的随机密码
JWT_SECRET=换成独立的随机密钥
SYSTEM_AES_KEY=换成恰好32个ASCII字符的密钥
```

可以用 `openssl rand -hex 24` 生成数据库和 Redis 密码、`openssl rand -hex 32` 生成 JWT 密钥、`openssl rand -hex 16` 生成 **32 字符**的 `SYSTEM_AES_KEY`。妥善备份 `SYSTEM_AES_KEY`；更换它会导致数据库里已加密的模型 API Key 无法解密。`.env` 已被 Git 忽略，不要提交。示例环境文件自带 Langfuse 占位密钥，因此这里显式关闭可选的追踪功能；知识库上传、检索和问答不依赖它。

第一次创建管理员账号后，把 `DISABLE_REGISTRATION` 改为 `true`，再执行 `docker compose up -d --no-build app`。需要其他人使用时，通过产品的账号与空间权限进行管理。

## 3. 清除本机专用配置

在服务器副本的 `docker-compose.yml` 中，仅做以下两处编辑：

1. 从 `app.volumes` 删除 `./config/builtin_models.yaml:/app/config/builtin_models.yaml:ro` 这一行。原文件会在每次启动时把本地 `bge-m3` 和 `qwen2.5vl:3b` 注册回数据库；云端改为在界面配置在线模型。
2. 从 `app.extra_hosts` 删除 `api.minimaxi.com:47.79.2.234` 这一行。这是本机代理的临时 DNS 绕行配置，不能作为云端固定地址。保留 `host.docker.internal:host-gateway` 不影响部署。

检查编排有效，并确认上述本机专用行已消失：

```bash
docker compose config -q
grep -nE 'api\.minimaxi\.com:47\.79\.2\.234|./config/builtin_models.yaml:/app/config/builtin_models.yaml' docker-compose.yml
```

第二条命令**没有输出**才符合本文配置。不要启用 `full` profile；基础服务已包含前端、应用、文档解析、PostgreSQL 和 Redis。
后续从 Codeup 更新代码时，检查这两项服务器专用修改是否仍在，不要重新启用本地模型或固定 IP。

## 4. 构建自己的前端并启动

仓库的界面已经改过品牌和入口。直接运行官方前端镜像会丢失这些修改，因此要从本仓库构建前端。以下用临时 Node 容器构建，无需在 ECS 安装 Node：

```bash
docker run --rm \
  -v "$PWD/frontend:/work" -w /work \
  -e VITE_IS_DOCKER=true -e VITE_FRONTEND_COMMIT=codeup \
  node:22-bookworm sh -lc 'npm ci && npm run build'
grep -F '<title>realtime-speech</title>' frontend/dist/index.html
docker compose pull app docreader postgres redis
docker compose build frontend
docker compose up -d --no-build
docker compose up -d --no-build --no-deps --force-recreate frontend
docker compose ps
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8081/ | grep -F '<title>realtime-speech</title>'
```

前端镜像名为 `realtime-speech-knowledge-ui:local`，由本仓库的 `frontend/dist` 构建。不要拉取或运行官方 `wechatopenai/weknora-ui` 镜像。最后一条命令检查正在服务的页面标题；没有输出或仍显示 `WeKnora`，说明当前容器没有使用新前端，先检查 `docker compose images frontend` 和 `docker compose logs --tail=100 frontend`。

已部署的服务器更新代码后，也要重新执行上述前端构建和启动命令；仅 `git pull` 或 `docker compose pull` 不会更新页面。浏览器仍显示旧图标时再强制刷新页面。

等待 `app`、`docreader`、`postgres` 健康后再打开网页。若服务没有就绪，先看 `docker compose logs --tail=100 app docreader postgres`。不要用 `docker compose down -v` 停机；`-v` 会删除数据卷。

## 5. 域名和 HTTPS

在 ECS 安装 [Caddy 官方软件包](https://caddyserver.com/docs/install)，将 `/etc/caddy/Caddyfile` 配为：

```caddyfile
kb.example.com {
    reverse_proxy 127.0.0.1:8081
}
```

域名解析已指向 ECS，且公网 80/443 可达时，Caddy 会自动申请 HTTPS 证书。配置后执行 `sudo systemctl reload caddy`，访问 `https://kb.example.com`。[Caddy 反向代理说明](https://caddyserver.com/docs/quick-starts/reverse-proxy)

## 6. 在 WeKnora 界面配置在线模型

首次注册并登录后，打开「设置 → 模型」，逐个新增并使用界面的**测试**功能确认连通性：

| 类型 | 厂商 | 模型名 | API 地址 |
| --- | --- | --- | --- |
| 对话 `KnowledgeQA` | MiniMax | `MiniMax-M2.7-highspeed` | `https://api.minimaxi.com/v1` |
| 向量 `Embedding` | 阿里云百炼 | `text-embedding-v4`，维度 **1024** | 与百炼 API Key 同地域的 OpenAI 兼容地址 |
| 视觉 `VLLM` | 阿里云百炼 | `qwen3-vl-flash`，OpenAI 兼容接口 | 与百炼 API Key 同地域的 OpenAI 兼容地址 |

例如华北 2（北京）的公共兼容地址是 `https://dashscope.aliyuncs.com/compatible-mode/v1`。百炼的 API Key、地域和地址须匹配；若选择其他地域，使用[对应地域地址](https://help.aliyun.com/zh/model-studio/base-url)。模型 API Key 在界面里录入，不放进 Git 仓库。将对话和向量模型设为默认，在知识库图像处理设置中启用多模态并选择视觉模型。

`text-embedding-v4` 的默认向量维度是 1024；`qwen3-vl-flash` 支持图片理解。新建知识库时也要明确选择刚添加的向量模型。[百炼向量模型](https://help.aliyun.com/zh/model-studio/text-embedding-synchronous-api/)、[百炼视觉模型](https://help.aliyun.com/zh/model-studio/vision-model/)

## 7. 验收与后续维护

1. 新建知识库，上传一份可复制文字的 PDF，等状态就绪；在分块中找到原文后提问，核对引用和答案。
2. 上传扫描 PDF，确认「图像处理 → 多模态」已启用；检查分块中是否真的出现图片里的文字，再提问。仅有“解析完成”不算通过。
3. 分别测试资料内、资料外的问题；资料外的回答应能看出没有知识库依据。
4. 检查 HTTPS、登录、模型连通性和手机网络访问。确认正式使用前已关闭公开注册。
5. 备份 PostgreSQL、`data-files` 卷和 `SYSTEM_AES_KEY`；升级前先备份，并固定镜像版本。ECS 云盘可设置[自动快照](https://help.aliyun.com/zh/ecs/user-guide/create-a-snapshot)。

本文按新建知识库验收。若要迁移本机账号、资料和问答配置，还需单独迁移 PostgreSQL 与文件卷，并保持原 `SYSTEM_AES_KEY`；切换向量模型后重建索引，扫描文件更换视觉模型后重新解析。只拉取 Git 代码不会带来知识库数据。
