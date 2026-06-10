# music-score

五線譜を GUI で書き、読譜の助けになる機能を備えたフロントエンド完結の Web アプリ。

https://yutachaos.github.io/music-score/

## 機能

- **譜面エディタ**: 五線をクリックして音符を配置。パレットで音価・休符・臨時記号・調号・拍子を選択。↑↓ で音高、←→ で選択移動、Delete で削除、Ctrl+Z で元に戻す
- **読譜支援**: 再生（再生中の音符をハイライト）、テンポ変更、移調、音名表示（ドレミ / CDE）
- **保存**: ブラウザ（localStorage）に複数曲を自動保存。JSON / ABC 形式でエクスポート、JSON インポート
- **写真から読み取り（実験的）**: きれいに印刷された単旋律・ト音記号の譜面写真から音符を認識。音価はすべて四分音符として読み取るため、取込後にエディタで修正する前提

## 開発

```bash
npm install
npm run dev    # 開発サーバー
npm test       # ユニットテスト (vitest)
npm run build  # ビルド
```

main への push で GitHub Actions が GitHub Pages へ自動デプロイする。
