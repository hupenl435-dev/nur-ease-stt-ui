# Nurse UI GitHub Pages

這個專案已整理成可部署到 GitHub Pages 的 Vite + React 版本。

## 本機預覽

```bash
npm install
npm run dev
```

如果要讓手機在同一個 Wi-Fi 直接看：

```bash
npm run dev -- --host
```

## 部署到 GitHub Pages

1. 建立一個新的 GitHub repository。
2. 把這個資料夾內容推上 `main` 分支。
3. 到 GitHub repo 的 `Settings > Pages`。
4. `Source` 選 `GitHub Actions`。
5. 之後每次 push 到 `main`，就會自動部署。

部署成功後，手機直接打開 GitHub Pages 網址即可。
