import * as THREE from 'three';

// 環境ストーリーテリング: オブジェクト配置で物語を語る

export interface StoryScene {
  id: string;
  mapName: 'original' | 'tokyo' | 'space';
  title: string;
  description: string;
  objects: StoryObject[];
}

export interface StoryObject {
  type: string;  // 'tent', 'campfire', 'wreckage', 'barrier', etc.
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: number;
  details?: string;
}

// === ORIGINAL MAP ストーリーシーン ===
// テーマ: 「古代文明の崩壊と再生」

const ORIGINAL_STORY_SCENES: StoryScene[] = [
  {
    id: 'ori_evacuation_trail',
    mapName: 'original',
    title: '避難の軌跡',
    description: '古代文明崩壊時の避難ルート。テント、焚火跡、放棄された荷物が点在',
    objects: [
      // スタート地点: 村の跡
      { type: 'tent', position: { x: -1000, y: 0, z: 500 }, details: '破れたテント、急いで放棄された' },
      { type: 'campfire', position: { x: -1005, y: 0, z: 505 }, details: '消えた焚火、食料の残骸' },
      { type: 'supplies', position: { x: -995, y: 0, z: 495 }, details: '散乱した補給品' },

      // 中間地点1: 休憩キャンプ
      { type: 'tent', position: { x: -800, y: 0, z: 600 }, details: '2つ目のテント、ここで一晩過ごした' },
      { type: 'tent', position: { x: -805, y: 0, z: 608 }, details: '小さなテント、子供用か' },
      { type: 'campfire', position: { x: -802, y: 0, z: 604 }, details: '焚火の跡、周囲に座った痕跡' },

      // 中間地点2: 危険区域
      { type: 'abandoned_car', position: { x: -600, y: 0, z: 700 }, rotation: { x: 0, y: 0.5, z: 0 }, details: '放棄された車両、エンジン故障' },
      { type: 'luggage', position: { x: -595, y: 0, z: 698 }, details: '散乱した荷物、重すぎて放棄' },
      { type: 'luggage', position: { x: -598, y: 0, z: 703 }, details: 'スーツケース、開けっ放し' },

      // バリケード地点
      { type: 'barricade', position: { x: -400, y: 0, z: 800 }, details: '警告バリケード、「これより先危険」' },
      { type: 'warning_sign', position: { x: -405, y: 0, z: 805 }, details: '手書きの警告文' },

      // 終着点: シェルター入口（Underground Sanctuary）
      { type: 'shelter_entrance', position: { x: 100, y: -50, z: -500 }, details: 'シェルター入口、開いたまま' },
      { type: 'empty_supplies', position: { x: 95, y: -50, z: -505 }, details: '空の補給箱、先着者が持ち去った' },
    ]
  },

  {
    id: 'ori_ancient_ritual',
    mapName: 'original',
    title: '古代の儀式跡',
    description: 'Snow Temple周辺の儀式の痕跡。円形配置の石、祭壇、供物台',
    objects: [
      // 中央祭壇
      { type: 'altar', position: { x: -1500, y: 520, z: -1800 }, details: '中央祭壇、星図が刻まれている' },

      // 円形配置の石（12個、時計回り）
      { type: 'ritual_stone', position: { x: -1500, y: 520, z: -1770 }, details: '北の石' },
      { type: 'ritual_stone', position: { x: -1485, y: 520, z: -1777 }, details: '北北東' },
      { type: 'ritual_stone', position: { x: -1470, y: 520, z: -1788 }, details: '北東' },
      { type: 'ritual_stone', position: { x: -1463, y: 520, z: -1800 }, details: '東' },
      { type: 'ritual_stone', position: { x: -1470, y: 520, z: -1812 }, details: '南東' },
      { type: 'ritual_stone', position: { x: -1485, y: 520, z: -1823 }, details: '南南東' },
      { type: 'ritual_stone', position: { x: -1500, y: 520, z: -1830 }, details: '南' },
      { type: 'ritual_stone', position: { x: -1515, y: 520, z: -1823 }, details: '南南西' },
      { type: 'ritual_stone', position: { x: -1530, y: 520, z: -1812 }, details: '南西' },
      { type: 'ritual_stone', position: { x: -1537, y: 520, z: -1800 }, details: '西' },
      { type: 'ritual_stone', position: { x: -1530, y: 520, z: -1788 }, details: '北西' },
      { type: 'ritual_stone', position: { x: -1515, y: 520, z: -1777 }, details: '北北西' },

      // 供物台（4方向）
      { type: 'offering_table', position: { x: -1500, y: 520, z: -1775 }, details: '北の供物台、空' },
      { type: 'offering_table', position: { x: -1460, y: 520, z: -1800 }, details: '東の供物台、古代のコイン' },
      { type: 'offering_table', position: { x: -1500, y: 520, z: -1825 }, details: '南の供物台、宝石' },
      { type: 'offering_table', position: { x: -1540, y: 520, z: -1800 }, details: '西の供物台、巻物' },
    ]
  },

  {
    id: 'ori_battlefield_remains',
    mapName: 'original',
    title: '古戦場の痕跡',
    description: 'Grand Canyon周辺の古代戦争の跡。破壊された兵器、防御陣地',
    objects: [
      // 防御ライン1
      { type: 'defense_wall', position: { x: 1150, y: 50, z: -1850 }, details: '崩壊した防壁' },
      { type: 'defense_wall', position: { x: 1180, y: 50, z: -1850 }, details: '防壁の残骸' },
      { type: 'defense_wall', position: { x: 1210, y: 50, z: -1850 }, details: '防壁の一部' },

      // 破壊された兵器
      { type: 'ancient_weapon', position: { x: 1170, y: 50, z: -1840 }, rotation: { x: 0.3, y: 0.8, z: 0.2 }, details: '破壊された投石機' },
      { type: 'ancient_weapon', position: { x: 1200, y: 50, z: -1835 }, rotation: { x: -0.2, y: 1.2, z: 0.1 }, details: '倒れたバリスタ' },

      // 戦士の遺品
      { type: 'shield', position: { x: 1165, y: 50, z: -1860 }, rotation: { x: 0, y: 0, z: 1.5 }, details: '錆びた盾、矢の跡' },
      { type: 'sword', position: { x: 1168, y: 50, z: -1858 }, details: '折れた剣' },
      { type: 'helmet', position: { x: 1172, y: 50, z: -1862 }, details: '凹んだ兜' },

      // 防御ライン2（後退ライン）
      { type: 'barricade', position: { x: 1250, y: 80, z: -1800 }, details: '急造バリケード' },
      { type: 'barricade', position: { x: 1260, y: 80, z: -1795 }, details: 'バリケード、矢が刺さっている' },
      { type: 'barricade', position: { x: 1270, y: 80, z: -1790 }, details: '燃えた跡のあるバリケード' },
    ]
  },

  {
    id: 'ori_explorer_camp',
    mapName: 'original',
    title: '探検家のキャンプ',
    description: 'Natural Arch付近の探検隊ベースキャンプ。測量機器、記録ノート',
    objects: [
      // メインテント
      { type: 'large_tent', position: { x: -1800, y: 85, z: 1500 }, details: '大型テント、探検隊本部' },

      // 測量機器
      { type: 'surveying_equipment', position: { x: -1805, y: 85, z: 1510 }, details: '三脚付き測量機' },
      { type: 'theodolite', position: { x: -1810, y: 85, z: 1515 }, details: '経緯儀、アーチを測定中' },

      // 研究テーブル
      { type: 'research_table', position: { x: -1795, y: 85, z: 1505 }, details: 'テーブル、地図と記録ノート' },
      { type: 'map', position: { x: -1795, y: 86, z: 1505 }, details: '手描きの詳細地図' },
      { type: 'notebook', position: { x: -1793, y: 86, z: 1503 }, details: '観測記録ノート' },

      // 補給品
      { type: 'supply_crate', position: { x: -1790, y: 85, z: 1495 }, details: '食料箱' },
      { type: 'supply_crate', position: { x: -1788, y: 85, z: 1493 }, details: '装備箱' },
      { type: 'water_barrel', position: { x: -1792, y: 85, z: 1492 }, details: '水樽' },

      // 焚火
      { type: 'campfire', position: { x: -1798, y: 85, z: 1498 }, details: '焚火、まだ暖かい' },
    ]
  },
];

// === TOKYO MAP ストーリーシーン ===
// テーマ: 「最後の48時間」

const TOKYO_STORY_SCENES: StoryScene[] = [
  {
    id: 'tok_evacuation_chaos',
    mapName: 'tokyo',
    title: '避難の混乱',
    description: 'Mega Tower周辺の避難混乱。放棄された車、散乱した荷物、警告サイン',
    objects: [
      // 交差点の混乱
      { type: 'abandoned_car', position: { x: -200, y: 0, z: 150 }, rotation: { x: 0, y: 0.3, z: 0 }, details: '放棄された乗用車' },
      { type: 'abandoned_car', position: { x: -205, y: 0, z: 155 }, rotation: { x: 0, y: 1.8, z: 0 }, details: '衝突した車両' },
      { type: 'abandoned_car', position: { x: -198, y: 0, z: 158 }, rotation: { x: 0, y: 2.5, z: 0 }, details: 'ドアが開いたまま' },

      // 散乱した荷物
      { type: 'suitcase', position: { x: -203, y: 0, z: 152 }, details: 'スーツケース、衣類が飛び出している' },
      { type: 'backpack', position: { x: -201, y: 0, z: 156 }, details: 'リュックサック' },
      { type: 'shopping_bag', position: { x: -206, y: 0, z: 153 }, details: '買い物袋、食料' },

      // 警告・避難サイン
      { type: 'warning_sign', position: { x: -210, y: 0, z: 160 }, details: '緊急避難指示の電光掲示板' },
      { type: 'police_barrier', position: { x: -195, y: 0, z: 145 }, details: '警察のバリケード' },
    ]
  },

  {
    id: 'tok_last_broadcast',
    mapName: 'tokyo',
    title: '最後の放送',
    description: 'Skytree展望台の放送スタジオ。マイク、カメラ、最後のメッセージ',
    objects: [
      // 放送機器
      { type: 'broadcast_desk', position: { x: 600, y: 450, z: -400 }, details: 'アナウンサーデスク' },
      { type: 'microphone', position: { x: 600, y: 451, z: -400 }, details: 'マイク、オンのまま' },
      { type: 'camera', position: { x: 605, y: 450, z: -395 }, details: 'テレビカメラ、録画中断' },

      // 原稿・メモ
      { type: 'script', position: { x: 599, y: 451, z: -401 }, details: '原稿「最後の放送です…」' },
      { type: 'notes', position: { x: 601, y: 451, z: -399 }, details: '手書きのメモ、家族へのメッセージ' },

      // 個人的な遺品
      { type: 'photo_frame', position: { x: 598, y: 451, z: -402 }, details: '家族写真' },
      { type: 'coffee_cup', position: { x: 602, y: 451, z: -398 }, details: 'コーヒーカップ、半分残っている' },
    ]
  },

  {
    id: 'tok_underground_shelter',
    mapName: 'tokyo',
    title: '地下シェルター準備',
    description: '地下施設の避難準備。補給品、ベッド、生活用品の配置',
    objects: [
      // 補給エリア
      { type: 'supply_shelf', position: { x: 50, y: -120, z: -50 }, details: '補給棚、缶詰が並ぶ' },
      { type: 'supply_shelf', position: { x: 55, y: -120, z: -50 }, details: '医薬品棚' },
      { type: 'supply_shelf', position: { x: 60, y: -120, z: -50 }, details: '飲料水棚' },

      // 居住エリア
      { type: 'bunk_bed', position: { x: 70, y: -120, z: -60 }, details: '二段ベッド、毛布が置かれている' },
      { type: 'bunk_bed', position: { x: 70, y: -120, z: -65 }, details: '二段ベッド' },
      { type: 'bunk_bed', position: { x: 70, y: -120, z: -70 }, details: '二段ベッド、荷物が置かれている' },

      // 生活用品
      { type: 'storage_box', position: { x: 65, y: -120, z: -55 }, details: '衣類収納ボックス' },
      { type: 'storage_box', position: { x: 67, y: -120, z: -55 }, details: '日用品ボックス' },

      // 掲示板
      { type: 'bulletin_board', position: { x: 60, y: -118, z: -45 }, details: '避難者名簿と規則' },
    ]
  },

  {
    id: 'tok_rooftop_signal',
    mapName: 'tokyo',
    title: '屋上の救助信号',
    description: 'Mega Tower屋上の救助信号。発煙筒、巨大なSOSサイン',
    objects: [
      // SOSサイン（布で作られた）
      { type: 'sos_sign_s', position: { x: -20, y: 798, z: -10 }, details: '巨大な「S」、白い布' },
      { type: 'sos_sign_o', position: { x: 0, y: 798, z: -10 }, details: '巨大な「O」' },
      { type: 'sos_sign_s2', position: { x: 20, y: 798, z: -10 }, details: '巨大な「S」' },

      // 発煙筒
      { type: 'flare', position: { x: -25, y: 798, z: -5 }, details: '使用済み発煙筒' },
      { type: 'flare', position: { x: 25, y: 798, z: -5 }, details: '使用済み発煙筒' },

      // 救助待機の跡
      { type: 'blanket', position: { x: -5, y: 798, z: 5 }, details: '毛布、待機していた' },
      { type: 'water_bottle', position: { x: -3, y: 798, z: 6 }, details: '空のペットボトル' },
      { type: 'radio', position: { x: -7, y: 798, z: 4 }, details: 'ポータブルラジオ、電池切れ' },
    ]
  },
];

// === SPACE MAP ストーリーシーン ===
// テーマ: 「大戦の終結」

const SPACE_STORY_SCENES: StoryScene[] = [
  {
    id: 'spa_battle_formation',
    mapName: 'space',
    title: '最終防衛線',
    description: 'Mothership周辺の艦隊配置が戦況を語る。防衛フォーメーション',
    objects: [
      // 防衛ライン（Mothership前方）
      { type: 'destroyer_wreck', position: { x: 0, y: 400, z: -500 }, rotation: { x: 0, y: 0, z: 0 }, details: '駆逐艦、前衛で戦死' },
      { type: 'destroyer_wreck', position: { x: -200, y: 380, z: -600 }, rotation: { x: 0.2, y: 0.5, z: 0 }, details: '駆逐艦、左翼' },
      { type: 'destroyer_wreck', position: { x: 200, y: 420, z: -600 }, rotation: { x: -0.1, y: -0.3, z: 0 }, details: '駆逐艦、右翼' },

      // 第二防衛ライン
      { type: 'cruiser_wreck', position: { x: -300, y: 500, z: -200 }, rotation: { x: 0, y: 0.8, z: 0.1 }, details: '巡洋艦、側面防御' },
      { type: 'cruiser_wreck', position: { x: 300, y: 480, z: -200 }, rotation: { x: 0, y: -0.9, z: -0.1 }, details: '巡洋艦、側面防御' },

      // 指揮艦（Mothershipの少し後方）
      { type: 'command_ship_wreck', position: { x: 0, y: 550, z: 200 }, details: '指揮艦、最後まで指揮を執った' },
    ]
  },

  {
    id: 'spa_escape_pods',
    mapName: 'space',
    title: '脱出ポッドの軌跡',
    description: 'Fortress崩壊時の脱出の痕跡。射出されたポッド、残された遺品',
    objects: [
      // 脱出ポッド（Fortress周辺に散在）
      { type: 'escape_pod', position: { x: -900, y: 380, z: 700 }, details: '脱出ポッド01、生命反応なし' },
      { type: 'escape_pod', position: { x: -850, y: 420, z: 750 }, details: '脱出ポッド02、ハッチ開放' },
      { type: 'escape_pod', position: { x: -920, y: 450, z: 680 }, details: '脱出ポッド03、損傷' },
      { type: 'escape_pod', position: { x: -880, y: 400, z: 720 }, details: '脱出ポッド04、救助待機中' },

      // 残された遺品（ポッド内部・周辺）
      { type: 'personal_belongings', position: { x: -900, y: 380, z: 705 }, details: '家族写真、手紙' },
      { type: 'dog_tag', position: { x: -850, y: 420, z: 755 }, details: '認識票' },
      { type: 'teddy_bear', position: { x: -920, y: 450, z: 685 }, details: '子供のぬいぐるみ' },
    ]
  },

  {
    id: 'spa_mining_colony_life',
    mapName: 'space',
    title: '採掘コロニーの日常',
    description: 'Mining Colony住居区。生活の痕跡、家族の写真、子供の落書き',
    objects: [
      // 居住モジュール1
      { type: 'living_quarter', position: { x: 1200, y: 180, z: -1200 }, details: '居住区A-1' },
      { type: 'family_photo', position: { x: 1201, y: 181, z: -1200 }, details: '壁に貼られた家族写真' },
      { type: 'childs_drawing', position: { x: 1202, y: 180, z: -1201 }, details: '子供の描いた絵「地球」' },

      // 居住モジュール2
      { type: 'living_quarter', position: { x: 1210, y: 180, z: -1200 }, details: '居住区A-2' },
      { type: 'calendar', position: { x: 1211, y: 181, z: -1200 }, details: 'カレンダー、地球帰還予定日に印' },
      { type: 'personal_items', position: { x: 1212, y: 180, z: -1201 }, details: '私物、時計、本' },

      // 共用エリア
      { type: 'dining_table', position: { x: 1206, y: 180, z: -1195 }, details: '食卓、食器が並んだまま' },
      { type: 'toy_box', position: { x: 1204, y: 180, z: -1193 }, details: 'おもちゃ箱、子供たちが遊んでいた' },

      // 掲示板
      { type: 'bulletin_board', position: { x: 1200, y: 182, z: -1190 }, details: '掲示板「採掘ノルマ達成おめでとう」' },
    ]
  },

  {
    id: 'spa_last_stand',
    mapName: 'space',
    title: '最後の抵抗',
    description: 'Fortress内部の最終防衛戦。バリケード、弾痕、防衛陣地',
    objects: [
      // バリケード（Fortress Layer 1）
      { type: 'barricade', position: { x: -750, y: 420, z: 750 }, details: '急造バリケード、金属板と貨物箱' },
      { type: 'barricade', position: { x: -755, y: 420, z: 755 }, details: 'バリケード、弾痕だらけ' },
      { type: 'barricade', position: { x: -760, y: 420, z: 760 }, details: 'バリケード、焼け焦げている' },

      // 防衛陣地
      { type: 'defense_turret', position: { x: -748, y: 425, z: 748 }, rotation: { x: 0, y: 2.3, z: 0 }, details: '防衛タレット、弾切れ' },
      { type: 'ammo_crate', position: { x: -752, y: 420, z: 753 }, details: '弾薬箱、空' },
      { type: 'med_kit', position: { x: -758, y: 420, z: 757 }, details: '医療キット、使用済み' },

      // 兵士の遺品
      { type: 'helmet', position: { x: -754, y: 420, z: 752 }, details: '兵士のヘルメット' },
      { type: 'weapon', position: { x: -756, y: 420, z: 754 }, details: '小銃、弾倉空' },
      { type: 'dog_tag', position: { x: -755, y: 420, z: 753 }, details: '認識票「最後まで戦った」' },
    ]
  },

  {
    id: 'spa_observatory_discovery',
    mapName: 'space',
    title: '観測所の発見',
    description: 'Observatory Watchtowerの観測記録。謎の信号、警告メッセージ',
    objects: [
      // 観測機器
      { type: 'telescope', position: { x: 2000, y: 350, z: 1800 }, details: '大型望遠鏡、特定方向を向いている' },
      { type: 'computer', position: { x: 2005, y: 351, z: 1805 }, details: 'コンピューター、データ記録中' },
      { type: 'radio_receiver', position: { x: 2010, y: 351, z: 1810 }, details: '電波受信機、信号を捉えている' },

      // 記録・警告
      { type: 'observation_log', position: { x: 2003, y: 351, z: 1803 }, details: '観測記録「未確認物体接近中」' },
      { type: 'warning_message', position: { x: 2007, y: 352, z: 1807 }, details: '警告メッセージ「司令部に報告済み」' },
      { type: 'star_chart', position: { x: 2002, y: 351, z: 1802 }, details: '星図、脅威の進路が記されている' },

      // 個人的な記録
      { type: 'personal_diary', position: { x: 2008, y: 351, z: 1808 }, details: '日誌「誰も信じてくれない…でも本当だ」' },
      { type: 'photograph', position: { x: 2004, y: 351, z: 1804 }, details: '写真、未確認物体の画像' },
    ]
  },
];

// 全ストーリーシーンをエクスポート
export const ALL_STORY_SCENES: StoryScene[] = [
  ...ORIGINAL_STORY_SCENES,
  ...TOKYO_STORY_SCENES,
  ...SPACE_STORY_SCENES,
];

// MAPごとのストーリーシーンを取得
export function getStoryScenesByMap(mapName: 'original' | 'tokyo' | 'space'): StoryScene[] {
  return ALL_STORY_SCENES.filter(scene => scene.mapName === mapName);
}

// ストーリーシーンのビジュアル作成（プレースホルダー）
export function createStorySceneVisuals(scene: THREE.Scene, storyScenes: StoryScene[]): THREE.Group {
  const storyGroup = new THREE.Group();
  storyGroup.name = 'StoryScenes';

  // 各ストーリーシーンのオブジェクトを配置
  // 現時点ではプレースホルダーとして簡易ジオメトリを使用
  // 正式版ではGLBモデルに置き換える

  const placeholderMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xffaa00,
    emissiveIntensity: 0.3,
    metalness: 0.5,
    roughness: 0.5,
  });

  for (const storyScene of storyScenes) {
    for (const obj of storyScene.objects) {
      // プレースホルダーボックス
      const placeholder = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        placeholderMat
      );

      placeholder.position.set(obj.position.x, obj.position.y, obj.position.z);

      if (obj.rotation) {
        placeholder.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
      }

      if (obj.scale) {
        placeholder.scale.setScalar(obj.scale);
      }

      placeholder.userData = {
        storySceneId: storyScene.id,
        objectType: obj.type,
        details: obj.details,
      };

      storyGroup.add(placeholder);
    }
  }

  scene.add(storyGroup);
  return storyGroup;
}

// ストーリーシーン情報の取得（プレイヤーが近づいた時）
export function getStoryObjectInfo(object: THREE.Object3D): string | null {
  if (object.userData.storySceneId && object.userData.details) {
    return `[${object.userData.objectType}] ${object.userData.details}`;
  }
  return null;
}
