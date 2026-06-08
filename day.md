你需要打开两个独立的终端窗口：

终端 1（前端服务） - 启动 Vite 开发服务器页面交互：
pnpm run dev
pnpm run dev:server


终端 2（后端 API & WebSocket 服务） - 启动数据服务器接口：

(这会使用 node --watch server.cjs 运行，当你在本地修改 server.cjs 时，后端会自动重启)

未来部署到服务器的流程：
当你开发完需要推送到服务器时，通常的流程会合并起来：

构建前端代码：

这会把前端代码打包到了 dist 或者你在 Vite 设定的输出目录中（通常服务器端的 node 脚本应该会静态返回这个目录）。
pnpm run build
node server.cjs


在服务器上运行后端代码：
如果你在这个项目代码的顶层运行：

或者使用 pm2 等守护进程管理工具启动 pm2 start server.cjs。
用户访问网页时，直接输入后端的监听端口或配合 Nginx 服务器反向代理即可。