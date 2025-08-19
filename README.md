# ポーカー大会カレンダー（CSVビューア）

Googleスプレッドシートの公開CSVを取得して、ブラウザのみで表示・フィルタ・ソートできる最小フロントエンドです。

- データ元（CSV）: https://docs.google.com/spreadsheets/d/e/2PACX-1vQzRfrIH1vQwDxdZqaoE8t7Q33O5Hxig_18xijgI77yRhfgGUOEUsioJ9zD08hoNuMklZXOxqmmejfq/pub?gid=1600443875&single=true&output=csv
- 依存: [PapaParse](https://www.papaparse.com/)（CDN）

## 使い方

1. ローカルサーバを起動して `index.html` を開きます。
   - Python がある場合:
     ```sh
     python3 -m http.server 5173
     ```
     その後、ブラウザで http://localhost:5173 を開く

2. 画面上部のフィルタを使って絞り込み
   - フリーテキスト: 店名/タイトル/住所/エリア/プライズ文
   - エリア: CSV内のユニークエリア
   - 日付: yyyy-mm-dd（本日が含まれていれば自動セット）
   - 参加費(最小/最大): `entry_fee` 数値範囲

3. ヘッダクリックでソート（昇降順トグル）
   - デフォルトは開始時刻（昇順）

## ファイル構成

- `index.html` UI骨格と読み込み
- `styles.css` 見た目（レスポンシブ/固定ヘッダ）
- `app.js` ロジック（取得/パース/正規化/フィルタ/ソート/描画）

## 実装メモ

- 日付/時刻は `YYYY/MM/DD` と `YYYY/MM/DD HH:mm` を簡易パースし、`Date` に変換して比較。
- 金額は `,` や `円` を除去して数値化。
- CSVヘッダ想定:
  ```
  ID,shop_name,address,area,title,date,start_time,late_registration_time,entry_fee,add_on,prize_list,total_prize,guaranteed_amount,prize_text,link
  ```

## カスタマイズ

- 列の追加/表示順の変更は `index.html` の `<thead>` と `app.js` の `render()` を編集。
- 追加のフィルタは `applyFilters()` に条件を追加。
- 初期並び替えは `state.sort` 初期値で変更可能。

## ライセンス

MIT
