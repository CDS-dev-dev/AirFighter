import * as THREE from 'three';

// Logs: 環境ストーリーを伝える発見可能なレコード
export interface LogEntry {
  id: string;
  mapName: 'original' | 'tokyo' | 'space';
  position: { x: number; y: number; z: number };
  title: string;
  content: string;
  discovered: boolean;
}

// LocalStorage key
const LOGS_STORAGE_KEY = 'airfighter_logs_data';

// Logsデータの読み込み
export function loadLogsData(): LogEntry[] {
  const stored = localStorage.getItem(LOGS_STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }

  // 初回起動時: 120個のログを生成（各MAP 40個）
  return [
    // === Original MAP: 40 logs ===
    // Titan Peak area (5 logs)
    { id: 'ori_log_001', mapName: 'original', position: { x: -50, y: 580, z: -2700 }, title: '登山記録 #001', content: '第一登山隊の記録。標高580m地点まで到達。ここから先は氷河帯に入る。', discovered: false },
    { id: 'ori_log_002', mapName: 'original', position: { x: -120, y: 800, z: -2800 }, title: '遭難者の日誌', content: '吹雪が激しくなってきた。ベースキャンプに戻るべきか…頂上はもう目の前なのに。', discovered: false },
    { id: 'ori_log_003', mapName: 'original', position: { x: -80, y: 1100, z: -2750 }, title: '気象観測記録', content: '標高1100m。風速25m/s、気温-18℃。この高度での気象観測は世界初。', discovered: false },
    { id: 'ori_log_004', mapName: 'original', position: { x: -100, y: 1350, z: -2720 }, title: '頂上到達証明', content: '我々はTitan Peakの頂上に到達した。人類史上初の快挙だ。', discovered: false },
    { id: 'ori_log_005', mapName: 'original', position: { x: -90, y: 1490, z: -2740 }, title: '古代の石碑', content: '頂上付近で発見。古代文明の痕跡か？文字は解読不能だが、星図らしきものが刻まれている。', discovered: false },

    // Grand Canyon area (5 logs)
    { id: 'ori_log_006', mapName: 'original', position: { x: 1200, y: 20, z: -1800 }, title: '地質調査報告', content: 'Grand Canyonの地層は少なくとも5億年前のもの。この惑星の歴史が刻まれている。', discovered: false },
    { id: 'ori_log_007', mapName: 'original', position: { x: 1350, y: 150, z: -1750 }, title: '化石発見記録', content: '未知の生物の化石を発見。翼竜に似ているが、骨格構造が全く異なる。', discovered: false },
    { id: 'ori_log_008', mapName: 'original', position: { x: 1280, y: 80, z: -1900 }, title: '探検家の手記', content: 'Canyon底部の洞窟を探索中。地下水脈の音が聞こえる。', discovered: false },
    { id: 'ori_log_009', mapName: 'original', position: { x: 1400, y: 250, z: -1820 }, title: '鉱物サンプル分析', content: 'Canyon壁面から採取したサンプル。希少鉱物「オリハルコン」の可能性あり。', discovered: false },
    { id: 'ori_log_010', mapName: 'original', position: { x: 1220, y: 10, z: -1950 }, title: '地底湖の発見', content: 'Canyon最深部に巨大な地底湖を発見。透明度は驚異の50m以上。', discovered: false },

    // Great Waterfall area (5 logs)
    { id: 'ori_log_011', mapName: 'original', position: { x: 2100, y: 50, z: 1200 }, title: '水源調査記録', content: 'Great Waterfallの水源を追跡。地下水脈は遥か北方の氷河に繋がっている。', discovered: false },
    { id: 'ori_log_012', mapName: 'original', position: { x: 2050, y: 180, z: 1150 }, title: '滝裏の洞窟', content: '滝の裏側に隠された洞窟を発見。古代の壁画が残されている。', discovered: false },
    { id: 'ori_log_013', mapName: 'original', position: { x: 2120, y: 120, z: 1250 }, title: '虹の観測データ', content: '滝壺に常に虹が現れる。光の屈折率から水質の純度が分かる。', discovered: false },
    { id: 'ori_log_014', mapName: 'original', position: { x: 2080, y: 10, z: 1180 }, title: '水生生物記録', content: '滝壺に生息する発光魚を観察。夜になると青白く光る。', discovered: false },
    { id: 'ori_log_015', mapName: 'original', position: { x: 2150, y: 220, z: 1220 }, title: '音響測定', content: '滝の轟音は110dB。しかし奇妙な共鳴現象により、特定の場所では静寂が保たれる。', discovered: false },

    // Natural Arch area (5 logs)
    { id: 'ori_log_016', mapName: 'original', position: { x: -1800, y: 85, z: 1500 }, title: '侵食パターン研究', content: 'Natural Archは1000年で1cmずつ侵食が進んでいる。計算上、あと500年で崩壊。', discovered: false },
    { id: 'ori_log_017', mapName: 'original', position: { x: -1850, y: 120, z: 1480 }, title: '建築学的考察', content: 'このアーチ構造は完璧なカテナリー曲線。自然が生んだ奇跡の建築。', discovered: false },
    { id: 'ori_log_018', mapName: 'original', position: { x: -1820, y: 60, z: 1520 }, title: '風の観測', content: 'アーチを通る風は常に一定の音を奏でる。自然の楽器だ。', discovered: false },
    { id: 'ori_log_019', mapName: 'original', position: { x: -1780, y: 150, z: 1490 }, title: 'クライマーの記録', content: 'アーチ頂上への登攀成功。眺望は息を呑むほど美しい。', discovered: false },
    { id: 'ori_log_020', mapName: 'original', position: { x: -1830, y: 100, z: 1510 }, title: '光の記録', content: '日の出時、アーチの影が完璧な円を描く。年に一度だけの現象。', discovered: false },

    // Alpine Lake area (4 logs)
    { id: 'ori_log_021', mapName: 'original', position: { x: -800, y: 420, z: -1200 }, title: '湖底調査', content: 'Alpine Lakeの水深は予想を超える180m。湖底に何かの構造物が…？', discovered: false },
    { id: 'ori_log_022', mapName: 'original', position: { x: -750, y: 450, z: -1180 }, title: '水質分析', content: '湖水の透明度は世界最高レベル。不純物が殆どない。', discovered: false },
    { id: 'ori_log_023', mapName: 'original', position: { x: -820, y: 430, z: -1220 }, title: '氷河期の証拠', content: '湖底の堆積物から、2万年前の氷河期の痕跡を発見。', discovered: false },
    { id: 'ori_log_024', mapName: 'original', position: { x: -780, y: 440, z: -1190 }, title: '湖畔の小屋', content: '古い小屋を発見。かつてここに住んでいた隠者の日記が残されている。', discovered: false },

    // Jungle Heart area (4 logs)
    { id: 'ori_log_025', mapName: 'original', position: { x: 800, y: 50, z: 2200 }, title: '植生調査', content: 'Jungle Heartには3000種以上の植物が共生。生物多様性のホットスポット。', discovered: false },
    { id: 'ori_log_026', mapName: 'original', position: { x: 850, y: 80, z: 2250 }, title: '新種発見', content: '発光キノコの新種を発見。夜のジャングルは幻想的に輝く。', discovered: false },
    { id: 'ori_log_027', mapName: 'original', position: { x: 820, y: 120, z: 2180 }, title: '古代遺跡', content: 'ジャングルに埋もれた古代都市の一部を発見。文明の痕跡。', discovered: false },
    { id: 'ori_log_028', mapName: 'original', position: { x: 780, y: 60, z: 2220 }, title: '動物行動記録', content: '夜行性の希少動物を観察。この地域固有の生態系が保たれている。', discovered: false },

    // Desert Oasis area (4 logs)
    { id: 'ori_log_029', mapName: 'original', position: { x: 2500, y: 12, z: -800 }, title: 'オアシスの水源', content: 'Desert Oasisの水は地下100mの帯水層から湧き出している。', discovered: false },
    { id: 'ori_log_030', mapName: 'original', position: { x: 2480, y: 15, z: -750 }, title: '交易の記録', content: 'かつてここはキャラバンの休息地だった。古いコインが散乱している。', discovered: false },
    { id: 'ori_log_031', mapName: 'original', position: { x: 2520, y: 18, z: -820 }, title: '砂漠の生態系', content: 'オアシス周辺には200種以上の生物が生息。砂漠のオアシスは命の源。', discovered: false },
    { id: 'ori_log_032', mapName: 'original', position: { x: 2490, y: 10, z: -780 }, title: '星図の記録', content: 'オアシスで発見された古代の星図。ナビゲーションに使われていた証拠。', discovered: false },

    // Snow Temple area (4 logs)
    { id: 'ori_log_033', mapName: 'original', position: { x: -1500, y: 520, z: -1800 }, title: '寺院建築記録', content: 'Snow Templeの建築様式は古代文明のもの。誰が、なぜここに建てたのか。', discovered: false },
    { id: 'ori_log_034', mapName: 'original', position: { x: -1480, y: 550, z: -1820 }, title: '宗教儀式の痕跡', content: '寺院内部に祭壇の跡。かつてここで何らかの儀式が行われていた。', discovered: false },
    { id: 'ori_log_035', mapName: 'original', position: { x: -1520, y: 580, z: -1780 }, title: '古文書の断片', content: '寺院で発見された古文書。「星の民」という言葉が繰り返し現れる。', discovered: false },
    { id: 'ori_log_036', mapName: 'original', position: { x: -1490, y: 530, z: -1810 }, title: '地下墓所', content: '寺院地下に墓所を発見。ここに眠る者たちは何者だったのか。', discovered: false },

    // Underground Sanctuary area (4 logs)
    { id: 'ori_log_037', mapName: 'original', position: { x: 100, y: -180, z: -500 }, title: '避難所の設計図', content: 'Underground Sanctuaryは核シェルターとして設計された。何からの避難？', discovered: false },
    { id: 'ori_log_038', mapName: 'original', position: { x: 120, y: -150, z: -520 }, title: '生命維持システム', content: 'ここには100年間生存可能な設備が整っている。今も稼働中。', discovered: false },
    { id: 'ori_log_039', mapName: 'original', position: { x: 80, y: -200, z: -480 }, title: '最後の記録', content: '「地上はもう住めない。我々はここで文明を再建する」─最後の入居者の記録。', discovered: false },
    { id: 'ori_log_040', mapName: 'original', position: { x: 110, y: -170, z: -510 }, title: 'タイムカプセル', content: '2156年に埋められたタイムカプセル。当時の世界の記録が詰まっている。', discovered: false },

    // === Tokyo MAP: 40 logs ===
    // Mega Tower area (8 logs)
    { id: 'tok_log_001', mapName: 'tokyo', position: { x: 0, y: 120, z: 0 }, title: '建設記録 #001', content: 'Mega Tower建設開始。高さ800mの超高層建築は人類史上最大のプロジェクト。', discovered: false },
    { id: 'tok_log_002', mapName: 'tokyo', position: { x: 20, y: 350, z: 20 }, title: '住民日誌', content: '35階層に引っ越してきた。窓からは東京全域が見渡せる。まるで雲の上の世界。', discovered: false },
    { id: 'tok_log_003', mapName: 'tokyo', position: { x: -15, y: 550, z: -10 }, title: 'メンテナンス報告', content: '55階層の構造チェック。風速30m/sでも安定。設計は完璧だ。', discovered: false },
    { id: 'tok_log_004', mapName: 'tokyo', position: { x: 10, y: 700, z: -20 }, title: '展望台ログ', content: '70階展望台からの眺望。富士山、東京湾、全てが一望できる。観光客で溢れている。', discovered: false },
    { id: 'tok_log_005', mapName: 'tokyo', position: { x: -20, y: 780, z: 15 }, title: '通信アンテナ記録', content: '78階通信室。ここから東京全域の通信を管理している。', discovered: false },
    { id: 'tok_log_006', mapName: 'tokyo', position: { x: 5, y: 795, z: -5 }, title: '最上階の秘密', content: '最上階には謎のラボがある。一般人は立ち入り禁止。何の研究？', discovered: false },
    { id: 'tok_log_007', mapName: 'tokyo', position: { x: -10, y: 250, z: 30 }, title: 'AI管理システム', content: 'タワー全体をAIが管理。エレベーター、空調、セキュリティ…全て自動化。', discovered: false },
    { id: 'tok_log_008', mapName: 'tokyo', position: { x: 15, y: 480, z: -15 }, title: '非常事態記録', content: '2025年の大地震時、タワーは無傷。免震構造が完璧に機能した。', discovered: false },

    // Skytree area (6 logs)
    { id: 'tok_log_009', mapName: 'tokyo', position: { x: 600, y: 350, z: -400 }, title: 'Skytree設計図', content: '634mの高さは語呂合わせ「むさし（武蔵）」。江戸時代の地名への敬意。', discovered: false },
    { id: 'tok_log_010', mapName: 'tokyo', position: { x: 610, y: 450, z: -410 }, title: '第一展望台記録', content: '350m地点。ここから見る東京の夜景は世界一美しい。', discovered: false },
    { id: 'tok_log_011', mapName: 'tokyo', position: { x: 590, y: 550, z: -390 }, title: '第二展望台記録', content: '450m地点。気圧が低く、耳が痛くなる。でも眺望は格別。', discovered: false },
    { id: 'tok_log_012', mapName: 'tokyo', position: { x: 605, y: 630, z: -405 }, title: '頂上アンテナ', content: '最上部のアンテナは雷を呼ぶ。年間20回以上の落雷を記録。', discovered: false },
    { id: 'tok_log_013', mapName: 'tokyo', position: { x: 595, y: 280, z: -395 }, title: 'ライトアップ記録', content: 'Skytreeのライトアップは2パターン。「粋」と「雅」。日本の美意識を表現。', discovered: false },
    { id: 'tok_log_014', mapName: 'tokyo', position: { x: 615, y: 500, z: -415 }, title: '強風観測', content: '風速40m/sでも揺れは僅か。制振装置が完璧に機能している。', discovered: false },

    // Stadium area (5 logs)
    { id: 'tok_log_015', mapName: 'tokyo', position: { x: -600, y: 35, z: 800 }, title: 'Stadium建設記録', content: '直径400mのドーム型スタジアム。収容人数8万人。東京オリンピックのメイン会場。', discovered: false },
    { id: 'tok_log_016', mapName: 'tokyo', position: { x: -580, y: 55, z: 820 }, title: '音響設計', content: 'スタジアムの音響は完璧。どの席からも均一に音が届く。', discovered: false },
    { id: 'tok_log_017', mapName: 'tokyo', position: { x: -620, y: 45, z: 780 }, title: '開閉式屋根', content: '屋根の開閉は15分。天候に応じて自動制御される。', discovered: false },
    { id: 'tok_log_018', mapName: 'tokyo', position: { x: -610, y: 25, z: 810 }, title: '地下施設', content: 'スタジアム地下には選手用トレーニング施設。最新設備が揃っている。', discovered: false },
    { id: 'tok_log_019', mapName: 'tokyo', position: { x: -590, y: 65, z: 790 }, title: '歴史的イベント', content: '2025年ワールドカップ決勝戦。10万人の観客が詰めかけた。', discovered: false },

    // Twin Towers area (4 logs)
    { id: 'tok_log_020', mapName: 'tokyo', position: { x: 800, y: 280, z: 600 }, title: 'Twin Towers計画', content: '高さ450mの双子タワー。シンメトリーデザインが美しい。', discovered: false },
    { id: 'tok_log_021', mapName: 'tokyo', position: { x: 850, y: 320, z: 620 }, title: 'スカイブリッジ', content: '2棟を繋ぐ40階のスカイブリッジ。地上280m。スリル満点の空中散歩。', discovered: false },
    { id: 'tok_log_022', mapName: 'tokyo', position: { x: 820, y: 400, z: 580 }, title: '企業本社', content: 'タワーAには国際企業の本社。タワーBは高級レジデンス。', discovered: false },
    { id: 'tok_log_023', mapName: 'tokyo', position: { x: 830, y: 180, z: 610 }, title: '地震対策', content: 'ツインタワーは独立した基礎構造。片方が倒れても、もう片方は無事。', discovered: false },

    // Tilted Building area (3 logs)
    { id: 'tok_log_024', mapName: 'tokyo', position: { x: -800, y: 250, z: -600 }, title: '傾斜ビル設計', content: '15度傾いたビル。奇抜なデザインだが、構造計算は完璧。', discovered: false },
    { id: 'tok_log_025', mapName: 'tokyo', position: { x: -780, y: 320, z: -620 }, title: '内部構造', content: 'ビル内部の床は水平。外観だけが傾いている。建築の魔術。', discovered: false },
    { id: 'tok_log_026', mapName: 'tokyo', position: { x: -820, y: 180, z: -580 }, title: '観光名所', content: '傾斜ビルは東京の新名所。インスタ映えスポットとして人気。', discovered: false },

    // Giant Dome area (3 logs)
    { id: 'tok_log_027', mapName: 'tokyo', position: { x: 300, y: 55, z: -800 }, title: 'Giant Dome建設', content: '直径500mのドーム。内部には植物園、水族館、テーマパークを収容。', discovered: false },
    { id: 'tok_log_028', mapName: 'tokyo', position: { x: 320, y: 80, z: -780 }, title: '気候制御', content: 'ドーム内は完全気候制御。一年中快適な温度を保つ。', discovered: false },
    { id: 'tok_log_029', mapName: 'tokyo', position: { x: 280, y: 120, z: -820 }, title: '生態系保護', content: 'ドーム内で絶滅危惧種を保護。人工環境で生態系を再現。', discovered: false },

    // Commercial District (3 logs)
    { id: 'tok_log_030', mapName: 'tokyo', position: { x: 150, y: 15, z: 250 }, title: '商業地区の繁栄', content: 'Neo Tokyoの商業中心地。24時間眠らない街。', discovered: false },
    { id: 'tok_log_031', mapName: 'tokyo', position: { x: 180, y: 45, z: 220 }, title: 'ホログラム広告', content: '空中に浮かぶホログラム広告。未来的な風景が広がる。', discovered: false },
    { id: 'tok_log_032', mapName: 'tokyo', position: { x: 120, y: 75, z: 280 }, title: '深夜の賑わい', content: '深夜2時でも人で溢れている。Neo Tokyoは眠らない。', discovered: false },

    // Port District (3 logs)
    { id: 'tok_log_033', mapName: 'tokyo', position: { x: -1200, y: 8, z: 1500 }, title: '港湾施設記録', content: 'Neo Tokyo港。自動化コンテナターミナルは世界最大級。', discovered: false },
    { id: 'tok_log_034', mapName: 'tokyo', position: { x: -1150, y: 25, z: 1480 }, title: '貿易統計', content: '年間取扱量5000万トン。アジアの物流ハブとして機能。', discovered: false },
    { id: 'tok_log_035', mapName: 'tokyo', position: { x: -1250, y: 12, z: 1520 }, title: '海上警備', content: '港湾警備は24時間体制。AIドローンが巡回している。', discovered: false },

    // Underground (3 logs)
    { id: 'tok_log_036', mapName: 'tokyo', position: { x: 50, y: -120, z: -50 }, title: '地下都市計画', content: 'Neo Tokyoの地下には巨大な都市が広がる。地上と同規模の人口を収容。', discovered: false },
    { id: 'tok_log_037', mapName: 'tokyo', position: { x: 80, y: -180, z: -80 }, title: '地下農場', content: '地下3階層は農場。人工光で野菜を栽培。完全循環型農業。', discovered: false },
    { id: 'tok_log_038', mapName: 'tokyo', position: { x: 20, y: -150, z: -20 }, title: '地下交通網', content: '地下鉄は5層構造。最深部はリニア新幹線が時速500kmで走る。', discovered: false },

    // Mountains (2 logs)
    { id: 'tok_log_039', mapName: 'tokyo', position: { x: -2800, y: 420, z: -2800 }, title: '富士山観測', content: 'Neo Tokyo郊外から富士山が見える。日本の象徴は今も健在。', discovered: false },
    { id: 'tok_log_040', mapName: 'tokyo', position: { x: 2800, y: 380, z: 2800 }, title: '筑波山記録', content: '筑波山は科学都市の象徴。山頂には巨大研究施設がある。', discovered: false },

    // === Space MAP: 40 logs ===
    // Mothership area (8 logs)
    { id: 'spa_log_001', mapName: 'space', position: { x: 0, y: 520, z: 0 }, title: 'Mothership建造記録', content: '全長1000mの旗艦。人類最大の宇宙船建造プロジェクト開始。', discovered: false },
    { id: 'spa_log_002', mapName: 'space', position: { x: 20, y: 550, z: -30 }, title: '司令室ログ', content: '艦隊司令部からの通信。「全艦隊、戦闘配置につけ」─緊迫した状況。', discovered: false },
    { id: 'spa_log_003', mapName: 'space', position: { x: -15, y: 580, z: 20 }, title: '艦長日誌', content: '未知の宙域に突入。センサーが異常反応を示している。', discovered: false },
    { id: 'spa_log_004', mapName: 'space', position: { x: 10, y: 480, z: -10 }, title: '機関室報告', content: 'メインエンジン出力120%。このまま航行を続ければエンジンが焼き切れる。', discovered: false },
    { id: 'spa_log_005', mapName: 'space', position: { x: -20, y: 600, z: 15 }, title: '脱出ポッド記録', content: '緊急脱出プロトコル起動。全員退艦せよ。これは訓練ではない。', discovered: false },
    { id: 'spa_log_006', mapName: 'space', position: { x: 30, y: 530, z: -20 }, title: '医療ベイ', content: '負傷者多数。医療物資が不足している。補給を要請。', discovered: false },
    { id: 'spa_log_007', mapName: 'space', position: { x: -25, y: 560, z: 25 }, title: '兵器庫', content: 'Mothership武装：プラズマキャノン×12、ミサイルランチャー×48、レールガン×6。', discovered: false },
    { id: 'spa_log_008', mapName: 'space', position: { x: 5, y: 590, z: -15 }, title: 'ブラックボックス', content: '最後の記録：「敵艦隊接近。勝算なし。だが我々は戦う─」', discovered: false },

    // Fortress area (6 logs)
    { id: 'spa_log_009', mapName: 'space', position: { x: -800, y: 420, z: 800 }, title: 'Fortress設計図', content: '3層構造の宇宙要塞。防衛能力は艦隊10隻分に相当。', discovered: false },
    { id: 'spa_log_010', mapName: 'space', position: { x: -820, y: 450, z: 820 }, title: 'Layer 1記録', content: '外殻装甲：チタン合金50cm。小型艦の攻撃は無効化できる。', discovered: false },
    { id: 'spa_log_011', mapName: 'space', position: { x: -780, y: 480, z: 780 }, title: 'Layer 2記録', content: '中間層：居住区、司令室、生命維持システム。1万人収容可能。', discovered: false },
    { id: 'spa_log_012', mapName: 'space', position: { x: -810, y: 510, z: 810 }, title: 'Layer 3記録', content: 'コア：反応炉、兵器システム、AI中枢。要塞の心臓部。', discovered: false },
    { id: 'spa_log_013', mapName: 'space', position: { x: -790, y: 440, z: 790 }, title: '防衛戦記録', content: '敵艦隊との交戦。要塞防衛システム起動。撃墜数：47隻。', discovered: false },
    { id: 'spa_log_014', mapName: 'space', position: { x: -800, y: 490, z: 800 }, title: '要塞AI', content: '要塞を管理するAI「セントリー」。自律防衛プログラム稼働中。', discovered: false },

    // Mining Colony area (5 logs)
    { id: 'spa_log_015', mapName: 'space', position: { x: 1200, y: 180, z: -1200 }, title: '採掘作業記録', content: 'Mining Colony Alpha。希少鉱物イリジウムを採掘中。', discovered: false },
    { id: 'spa_log_016', mapName: 'space', position: { x: 1180, y: 220, z: -1180 }, title: '鉱夫の日誌', content: '宇宙での採掘は過酷だ。だが報酬は地球の10倍。あと2年頑張ろう。', discovered: false },
    { id: 'spa_log_017', mapName: 'space', position: { x: 1220, y: 200, z: -1220 }, title: '事故報告', content: '坑道崩落事故。作業員3名が閉じ込められた。救助隊出動。', discovered: false },
    { id: 'spa_log_018', mapName: 'space', position: { x: 1210, y: 250, z: -1210 }, title: '採掘機械', content: '最新型ドリルロボット導入。採掘効率が3倍に向上。', discovered: false },
    { id: 'spa_log_019', mapName: 'space', position: { x: 1190, y: 190, z: -1190 }, title: '鉱物分析', content: 'イリジウム純度99.8%。これは史上最高品質だ。', discovered: false },

    // Capital Ships area (5 logs)
    { id: 'spa_log_020', mapName: 'space', position: { x: -1500, y: 280, z: -800 }, title: 'Dreadnought記録', content: '戦艦ドレッドノート。全長600m。艦隊の主力艦。', discovered: false },
    { id: 'spa_log_021', mapName: 'space', position: { x: 1500, y: 320, z: 800 }, title: 'Carrier記録', content: '空母カリアー。戦闘機80機を搭載。制空権確保が任務。', discovered: false },
    { id: 'spa_log_022', mapName: 'space', position: { x: -1200, y: 350, z: 1500 }, title: 'Cruiser記録', content: '巡洋艦クルーザー。高速機動が強み。偵察任務が主。', discovered: false },
    { id: 'spa_log_023', mapName: 'space', position: { x: 1800, y: 300, z: -1200 }, title: 'Destroyer記録', content: '駆逐艦デストロイヤー。対艦ミサイル特化型。小回りが効く。', discovered: false },
    { id: 'spa_log_024', mapName: 'space', position: { x: -1800, y: 280, z: 1200 }, title: '艦隊編成', content: '第7艦隊：戦艦2、空母1、巡洋艦4、駆逐艦8。総員15,000名。', discovered: false },

    // Outer Stations area (4 logs)
    { id: 'spa_log_025', mapName: 'space', position: { x: -3500, y: 280, z: -3500 }, title: '北西ステーション', content: '辺境警備ステーション。敵艦隊の動向を監視中。', discovered: false },
    { id: 'spa_log_026', mapName: 'space', position: { x: 3500, y: 250, z: -3500 }, title: '北東ステーション', content: '補給基地として機能。艦隊の燃料・弾薬を補充。', discovered: false },
    { id: 'spa_log_027', mapName: 'space', position: { x: -3500, y: 300, z: 3500 }, title: '南西ステーション', content: '通信中継ステーション。艦隊間の通信を管理。', discovered: false },
    { id: 'spa_log_028', mapName: 'space', position: { x: 3500, y: 270, z: 3500 }, title: '南東ステーション', content: '研究施設。新型兵器の開発を進めている。', discovered: false },

    // Abandoned Stations area (4 logs)
    { id: 'spa_log_029', mapName: 'space', position: { x: -2800, y: 220, z: -2200 }, title: '廃棄ステーションA', content: '放棄された旧式ステーション。何年も人が訪れていない。', discovered: false },
    { id: 'spa_log_030', mapName: 'space', position: { x: 2800, y: 240, z: -2200 }, title: '廃棄ステーションB', content: 'ステーション内部にサルベージの痕跡。誰かが物資を回収した？', discovered: false },
    { id: 'spa_log_031', mapName: 'space', position: { x: -2200, y: 260, z: 2800 }, title: '廃棄ステーションC', content: '謎の生命反応を検出。無人のはずなのに…何かがいる。', discovered: false },
    { id: 'spa_log_032', mapName: 'space', position: { x: 2200, y: 230, z: 2800 }, title: '廃棄ステーションD', content: 'ステーションのログを発見。最後の記録：「助けて…誰か…」', discovered: false },

    // Debris Belt area (4 logs)
    { id: 'spa_log_033', mapName: 'space', position: { x: 0, y: 350, z: -2500 }, title: 'デブリ帯分析', content: '2000個以上のデブリが漂う危険宙域。航行には細心の注意が必要。', discovered: false },
    { id: 'spa_log_034', mapName: 'space', position: { x: 0, y: 400, z: 2500 }, title: '戦闘の痕跡', content: 'デブリは過去の大規模戦闘の残骸。何百隻もの艦が沈んだ。', discovered: false },
    { id: 'spa_log_035', mapName: 'space', position: { x: -2500, y: 380, z: 0 }, title: 'サルベージ作業', content: 'デブリから貴重な部品を回収。リサイクルして再利用する。', discovered: false },
    { id: 'spa_log_036', mapName: 'space', position: { x: 2500, y: 360, z: 0 }, title: 'デブリの危険性', content: '高速で漂うデブリは艦船の脅威。衝突すれば致命的。', discovered: false },

    // Asteroid Temple area (4 logs)
    { id: 'spa_log_037', mapName: 'space', position: { x: 1800, y: 180, z: 1800 }, title: '小惑星寺院発見', content: '小惑星内部に古代の寺院を発見。誰が、なぜここに建てたのか。', discovered: false },
    { id: 'spa_log_038', mapName: 'space', position: { x: 1820, y: 200, z: 1820 }, title: '古代文明の痕跡', content: '寺院の壁には未知の文字。「星の航海者」という言葉が刻まれている。', discovered: false },
    { id: 'spa_log_039', mapName: 'space', position: { x: 1780, y: 220, z: 1780 }, title: '神秘的な装置', content: '寺院中央に謎の装置。触れると星図が浮かび上がる。ナビゲーション？', discovered: false },
    { id: 'spa_log_040', mapName: 'space', position: { x: 1810, y: 190, z: 1810 }, title: '警告文', content: '寺院入口に刻まれた警告：「この先に進む者は覚悟せよ」─何が待っている？', discovered: false },
  ];
}

// Logsデータの保存
export function saveLogsData(logs: LogEntry[]): void {
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
}

// Log発見範囲（メートル）
const DISCOVERY_RANGE = 50;

// Logsのビジュアル表示（発光する結晶体）
export function createLogVisuals(scene: THREE.Scene, logs: LogEntry[]): THREE.Group {
  const logsGroup = new THREE.Group();

  // 発光マテリアル（青白い結晶）
  const logMat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff,
    emissiveIntensity: 0.8,
    metalness: 0.3,
    roughness: 0.2,
  });

  logs.forEach(log => {
    if (log.discovered) return; // 発見済みは表示しない

    // 結晶型ジオメトリ（八面体）
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(3, 0),
      logMat
    );

    crystal.position.set(log.position.x, log.position.y, log.position.z);
    crystal.userData = { logId: log.id };

    logsGroup.add(crystal);
  });

  scene.add(logsGroup);
  return logsGroup;
}

// Log発見チェック（プレイヤー位置との距離）
export function checkLogDiscovery(
  playerPosition: THREE.Vector3,
  logs: LogEntry[]
): LogEntry | null {
  for (const log of logs) {
    if (log.discovered) continue;

    const distance = playerPosition.distanceTo(
      new THREE.Vector3(log.position.x, log.position.y, log.position.z)
    );

    if (distance < DISCOVERY_RANGE) {
      return log;
    }
  }
  return null;
}

// Log発見時の処理
export function discoverLog(logId: string, logs: LogEntry[]): void {
  const log = logs.find(l => l.id === logId);
  if (!log) return;

  log.discovered = true;
  saveLogsData(logs);

  console.log(`[Logs] 発見: ${log.title}`);
  console.log(`内容: ${log.content}`);
}

// 統計情報
export function getLogsStats(logs: LogEntry[]): {
  total: number;
  discovered: number;
  byMap: { [key: string]: { total: number; discovered: number } };
} {
  const stats = {
    total: logs.length,
    discovered: logs.filter(l => l.discovered).length,
    byMap: {} as { [key: string]: { total: number; discovered: number } },
  };

  ['original', 'tokyo', 'space'].forEach(mapName => {
    const mapLogs = logs.filter(l => l.mapName === mapName);
    stats.byMap[mapName] = {
      total: mapLogs.length,
      discovered: mapLogs.filter(l => l.discovered).length,
    };
  });

  return stats;
}

// Logsリセット（デバッグ用）
export function resetLogs(): void {
  localStorage.removeItem(LOGS_STORAGE_KEY);
  console.log('[Logs] データをリセットしました');
}
