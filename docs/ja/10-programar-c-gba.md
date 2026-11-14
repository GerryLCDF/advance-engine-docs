#10 — ゲームボーイアドバンス用のC言語でのプログラミング

> **注:** この翻訳には誤りが含まれる可能性があります。元のドキュメントはスペイン語で書かれています。

> **適用対象:** モジュールに記述した **Direct C** コード ただし、*verbatim* は、AdvanceEngine が生成する `main.c` の `main()` の前に挿入されます。ここで説明した内容はすべてそのコードに有効であり、同時にハードウェアとエンジンが生成するテンプレートの完全なリファレンスでもあります。
>
> **前提条件:** **devkitARM** がインストールされている必要があります ([00 — はじめに](00-inicio.md) を参照)。パイプラインは `main.c` + `Makefile` を生成し、`arm-none-eabi-gcc` + `libgba` でコンパイルします。

---

## インデックス

1. [GBA ハードウェアの基本](#101-gba-hardware-basics)
2. [メモリマップ](#102-memory-map)
3. [入力/出力 (I/O) レジスタ](#103-io-input-output-registers)
4. [ビデオ: エンジンがモード 3 を使用する理由](#104-video-the-reason-why-the-engine-uses-mode-3)
5. [時間、スキャンライン、および VBLANK (神聖な予算)](#105-time-scanlines-and-vblank-the-sacred-budget)
6. [生成された`main.c`の構造](#106-生成されたmaincの構造)
7. [生成コードの種類と規約](#107-生成コードの種類と規約)
8. [アクターのシステム (ゲームの実体)](#108-system-of-actors-the-entities-of-the-game)
9. [入力: ボタンを読む](#109-input-read-the-buttons)
10. [移動と衝突](#1010-movement-and-collisions) — `movePlatformer` / `moveTopDown` プリミティブが含まれます
11. [サウンド: GBA APU](#1011-sound-the-gba-apu)12. [フレーム、vsync、アニメーション](#1012-frames-vsyncs-and-animation)
13. [スクリプトのダイレクト C: コントラクトと API](#1013-the-direct-c-of-your-scripts-contract-and-api)
14. [すぐにコピーできるスクリプトの例](#1014-すぐにコピーできるスクリプトの例)
15. [ROM 内のさまざまなシーン: `switchScene`、`near`、および `gJp`](#1015-various-scenes-in-the-rom-switchscene-near-y-gjp)
16. [最適化と黄金律](#1016-optimization-and-golden-rules)
17. [実際のコンソールでのデバッグとエミュレータ](#1017-debugging-in-the-real-console-vs-emulators)
18. [クイックリファレンス (チートシート)](#1018-クイックリファレンス-チートシート)
19. [用語解説](#1019-用語解説)

---

##10.1。 GBA ハードウェアの基本

### SoC とその CPU

GBA は、2001 年に発売された任天堂のポータブル コンソールです。その心臓部は **ARM7TDMI** です。

|プロパティ |値 |
| :--- | :--- |
|建築 | ARM7TDMI (32 ビット RISC) |
|命令モード | **ARM** (32 ビット、4 バイト) および **THUMB** (16 ビット、2 バイト) |
| CPUクロック | 16.78 MHz (同じバス速度) |
|フレームレート | ~59.73 fps (フレームあたり 280,896 サイクル) |
|代表的なパフォーマンス | ~16.8 MIPS (親指) / ARM の場合はそれ以上 |
|レビュー |多数の;ほとんどの ROM はどちらかで動作します。

CPU には、レジスタ R0 ～ R15、CPSR/SPSR などの小さなレパートリーもあります。 FPU はありません。**すべての浮動小数点を避ける必要があります** ([16](#1016-optimization-and-golden-rules) を参照)。

ボードは概念的に次のように分かれています。

- **CPU (ARM7TDMI)**- **ビデオ PPU** (モード 0 ～ 5、モード 3 ではハードウェア スプライトなし)
- **サウンド APU** (4 チャンネル: 2 パルス、1 波、1 ノイズ)
- **BIOS** (一部のサービスをブロックします。変更できません)

私たち (ソフトウェア レンダリング) の場合、CPU は **各ピクセル自体を描画**し、VRAM に直接書き込みます。したがって、*VBLANK 予算* (セクション 5) が生まれます。

---

##10.2。メモリマップ

GBA は 32 MB のアドレスを公開します。私たちにとって重要な地域:

|地域 |範囲 |サイズ |一般的な使用法 |スピード |
| :--- | :--- | :--- | :--- | :--- |
| **BIOS** | `0x00000000` | 16KB |システム システム (コピー/読み取りを行わないでください) | 1サイクル |
| **EWRAM** | `0x02000000` | 256KB |ビッグ データ、バッファー、`gActorBack` | 2 推定 (遅い) |
| **IWRAM** | `0x03000000` | 32KB |スタック、ホット変数 | 1 サイクル (高速) |
| **I/O** | `0x04000000` | 1KB |ビデオ、サウンド、入力レコード | — |
| **パレット** | `0x05000000` | 1KB |パレット 256×2 (ダイレクト MODE 3 では使用されません) | — |
| **VRAM** | `0x06000000` | 96KB |フレームバッファ/タイル/スプライト | 1 推定 |
| **OAM** | `0x07000000` | 1KB |ハードウェア スプライト (エンジンでは使用されません) | — |
| **ROM (PAK)** | `0x08000000` | ≤ 32MB |コード + 定数データ |推定2～4 |

**主な読み取り値:**

1. **モード 3** の VRAM は 96 KB: 240×160×2 バイトのフレームバッファは 76,800 B (75 KB) を占有します。隅のピクセル `(x, y)` は `((u16*)0x06000000)[y*240 + x]` にあります。テンプレートは、`u16* screen = (u16*)VRAM;` および `screen[pos]` を使用してこれを実行します。2. **EWRAM が遅い** (2 つの待機状態)。 240×160 は快適に適合せず、レンダリング中にピクセルごとにのみ読み取られるため、エンジンは `gActorBack` をそこに配置します。
3. **IWRAM は変数に対して最も高速です**。 `-O2` コンパイラはすでに `gba.specs` 経由でスタックをそこに配置しています。巨大なローカル配列を宣言しないでください。スタックは小さいからです。
4. **ROM は読み取り専用**で、`static const` データはそこに残ります。大きなテーブル (スプライト フレーム、期間テーブル、シーン) に便利です。

> AdvanceEngine プロジェクトでは、上記のすべてがすでにテンプレート全体に適切に分散されています。 Direct C を *書くときは、この階層を尊重するようにしてください: `const` 内のテーブル (ROM)、大きな `static` バッファー (EWRAM)、ローカル作業変数 (IWRAM)。

---

##10.3。入出力（I/O）レジスタ

レジスタは「volatile」を使用してポインタとしてアドレス指定されます。 libgba の `#include &lt;gba.h&gt;` はすでにそれらのほとんどを定義しています。このテンプレートは、セキュリティに必要なものを独自のマクロで定義します。

|登録 |住所 |アクセス |それは何ですか |
| :--- | :--- | :--- | :--- |
| `REG_DISPCNT` | `0x04000000` | ＲＷ |画面制御（モード＋レイヤー） |
| `REG_VCOUNT` | `0x04000006` | R |現在の走査線 (0-227) |
| `REG_KEYINPUT` | `0x04000130` | R |ボタンのステータス (**0 = 押された**) |
| `REG_SND1SWEEP` | `0x04000060` | ＲＷ |チャンネル 1: 周波数スイープ |
| `REG_SND1CNT` | `0x04000062` | ＲＷ |チャンネル 1: デューティ + サラウンド |
| `REG_SND1FREQ` | `0x04000064` | ＲＷ |チャンネル 1: ピリオド + キーをオン || `REG_SND2CNT` | `0x04000068` | ＲＷ |チャンネル 2: デューティ + サラウンド |
| `REG_SND2FREQ` | `0x0400006C` | ＲＷ |チャンネル 2: ピリオド + キーをオン |
| `REG_SND3CNT_L` | `0x04000070` | ＲＷ |チャンネル 3 (波): コントロール |
| `REG_SND3CNT_H` | `0x04000072` | ＲＷ |チャンネル 3 (波): ハイコントロール |
| `REG_SND3FREQ` | `0x04000074` | ＲＷ |チャンネル 3 (ウェーブ): ピリオド + キーをオン |
| `REG_SND4CNT` | `0x04000078` | ＲＷ |チャンネル 4 (ノイズ): サラウンド |
| `REG_SND4FREQ` | `0x0400007C` | ＲＷ |チャンネル 4 (ノイズ): レシオ + キーオン |
| `REG_SNDCTL` | `0x04000080` | ＲＷ |一般的なコントロール (ボリューム、イネーブル) |
| `REG_SNDCNTH` | `0x04000082` | ＲＷ |アテンションを有効にする/チャネルする |
| `REG_SNDCNTX` | `0x04000084` | ＲＷ |チャンネルボリューム |
| `REG_SNDBIAS` | `0x04000088` | ＲＷ | PWM バイアス (DAC バイアス) |
|ウェーブRAM | `0x04000090` | ＲＷ |チャンネル 3 の 16 個の 4 ビット サンプル |

テンプレートは、ほぼすべての main.c に次の便利な定義を生成します。
```c
#define REG_SND1SWEEP *(vu16*)(0x04000060)
#define REG_SND2CNT   *(vu16*)(0x04000068)
// ... y así con todos los de sonido
```
**レジストリの黄金律:** 常に「volatile」ポインタを介してアクセスします。 Libgba はそれらを「REG_*/IO_*」と呼びます。テンプレートは `REG_DISPCNT`、`REG_VCOUNT`、`REG_KEYINPUT` を使用します。

---

##10.4。ビデオ: エンジンが MODE 3 を使用する理由

GBA には 6 つのビデオ モードがあります。

|モード |タイプ |画面 |
| :--- | :--- | :--- |
| 0 |タイル 4 BG、すべてキャラクターごと | 4つのプラン |
| 1 |タイル + 1 回転/スケール | — |
| 2 |タイルの回転/スケール | 2 BG |
| **3** | **ビットマップ 240×160、ピクセルあたり 16 ビット** | **1 フレームバッファ** |
| 4 |ビットマップ 240×160、8 ビット + パレット | 1 ～ 2 フレームバッファ |
| 5 |ビットマップ 160×128、16 ビット | 1 ～ 2 フレームバッファ |

**AdvanceEngine はモード 3** を使用します。ソフトウェア レンダリングでは最も単純です。 `main()` は次のことを行います。
```c
REG_DISPCNT = MODE_3 | BG2_ENABLE;
u16* screen = (u16*)VRAM;
```
-
 各ピクセルは **RGB555 形式**の `u16` (2 バイト) です。
- BG2_ENABLE (ビット 10 = 0x400) は、描画されるプレーンをアクティブにします。
- ビットマップ モードにはハードウェア スプライトはありません。**エンジン アクターは CPU によって描画されます** (セクション 8 を参照)。

### RGB555 ピクセル形式
```
15 14 13 12 11 10 9 8 7 6 5 4 3 2 1 0
 x  B  B  B  B  B G G G G G R R R R R
    x  ·          bits del color         ·
```
-
 赤 (5 ビット)、緑 (5)、青 (5) = **チャンネルごとに 32 レベル** → 32,768 色が可能。
- ビット 15 はモード 3 では使用されません (テンプレートは内部スプライト マーカー用に予約しています: **ビット 15 = 1 はアクターのフレーム内の透明ピクセルを意味します**)。

CSS/RGB カラー (0 ～ 255) を GBA 値に変換するには、エンジンと同じ式を使用します。
```c
#define RGB555(r, g, b) ((((r) >> 3) | (((g) >> 3) << 5) | (((b) >> 3) << 10)) & 0x7FFF)
```
例: `RGB555(255, 0, 0)` → `0x7C00` (純粋な赤)、`RGB555(0,0,255)` → `0x001F` (純粋な青)、白 → `0x7FFF`。

### ピクセルを書き込む / 画面全体に表示する
```c
// Un píxel
screen[y * 240 + x] = RGB555(255, 255, 255);

// Barrer toda la pantalla (patrón que usa el motor para fondos)
for (i = 0; i < PIXEL_COUNT; i++) screen[i] = color;
// con PIXEL_COUNT = 240*160 = 38400
```
> **できれば、VRAM を VBLANK の外側に書き込まないでください**。ティアリングが発生します。エンジンは「waitVSync()」内にシーンを描画します。独自のテキストを表示するスクリプトでも同じことを行う必要があります。

---

##10.5。時間、スキャンライン、VBLANK (神聖な予算)

### 実際のコンソールのタイミング

- LCD は **1 フレームあたり 228 ライン** を描画します: 160 可視 + 68 ブランキング。
- 各ラインは **1232 CPU サイクル**続きます。
- 合計フレーム = 228 × 1232 = **280,896 サイクル** → **59.73 fps**。
- 画面がスキャンされない間隔 (VBLANK) = 68 × 1232 = **~83,800 サイクル**。
```c
static void waitVSync(void) {
  while (REG_VCOUNT >= SCREEN_H);   // esperar a que deje la zona visible
  while (REG_VCOUNT < SCREEN_H);    // y que entre en la zona de blanking
}
```
テンプレートは、ゲーム ループの各ターンで `waitVSync()` を呼び出します。 1 つの「waitVSync()」と次の「waitVSync()」の間で、**フレームを失うことなく最大 83,800 回の作業サイクルを実行できます**。

### 予算ルール

フレームが VBLANK に収まらないほど多くの作業を行う場合:

1. 次のフレームが食べられます。ゲーム ループは **約 30 fps** (またはそれ以上) に低下します。
2. アニメーション (vsync で遅延) が遅くなります。
3. 実際のコンソールでは、LCD が最後のアクターの領域をすでにキャプチャしている下部領域に *ちらつき* が表示されます。

エンジンは、これが起こらないように最適化されています ([16](#1016-optimization-and-golden-rules) を参照)。

- アクターのレンダリングには、**不透明ピクセルあたり最大 15 サイクル** かかります (シングル パスで描画および消去)。
- 経験則: ** フレームごとのカメラ内スプライトは最大 5,600 ピクセル** が緩く収まります。
- オフカメラのアクターにはほとんどコストがかかりません (長方形クランプ → ピクセルあたりの作業は 0)。

**スクリプトは軽量である必要があります。** フレームごとにアクターごとに数十の操作は無関係です。 VBLANK 内で数千回の繰り返しをネストしたループがあると、リズムが崩れてしまいます。

---

##10.6。生成された`main.c`の構造

AdvanceEngine の「main.c」は次の順序に従います (プロジェクトによって部分的に異なります)。
```
1.  Encabezado (nombre, autor, fecha)
2.  #include <gba.h> y <string.h>
3.  SCREEN_W, SCREEN_H, PIXEL_COUNT, waitVSync()
4.  Prototipos de actores (si hay actores + transición)
5.  Fade transitions (si se usan fades)
6.  Splash screen (si lo hay)
7.  Escena (sceneData / SCENE_COLOR)
8.  Mapa de colisiones (si hay)
9.  Sound types + initSound() + noteOn() + tabla de periodos
10. Canciones (splash y/o escena)
11. Transiciones custom de tileset (runToScene/runToBlack)
12. Actores: sprites const, pool gFrames, gActors, physics, draw
13. Scripts de usuario (tu C Directo) + userScriptsInit/Update
14. int main() { init, splash, fill, sceneInit, sceneLoop }
```
### `main()` の内部を見る
```c
int main() {
  REG_DISPCNT = MODE_3 | BG2_ENABLE;
  u16* screen = (u16*)VRAM;
  // [si splash] mostrar splashScreenData durante SPLASH_DURATION
  // [si entrada custom] runToScene_Entry(sceneData, N);  // transición
  // o [si fade]          fadeToScene(sceneData, N);
  // luego se pinta la escena en el framebuffer y entra el bucle:
  // sceneInit();   -> snapshot del fondo + initActors() + dibujo inicial
  // sceneLoop();   -> while(1) { waitVSync(); actorLoopBody(); }
}
```
### シーン関数 (スクリプトから表示されます)
```c
// Fondo de la escena (framebuffer)
const u16 sceneData[PIXEL_COUNT] = { ... };  // o SCENE_COLOR

// Inicializa la escena: copia el fondo a gActorBack, pone actores en su
// sitio, los dibuja por primera vez, y si tienes scripts llama script_init()
static void sceneInit(void);

// Bucle infinito de juego
static void sceneLoop(void);

// Cuerpo de cada frame (llamado tras waitVSync)
static void advanceAllActors(void);   // animación automática de sprites
static void updatePlayer(void);       // input + colisiones + empuje actor-actor
static void drawAllActors(u16* screen); // orden z + píxeles
```
> main() とは書きません。コードは **1 レベル下**に挿入されます。このファイルは、`script_init`/`script_update` 関数のためにのみ存在する有効なファイルです ([13](#1013-the-direct-c-of-your-scripts-contract-and-api) を参照)。

---

##10.7。生成されるコードの種類と規則

libgba は、テンプレート (`#include &lt;gba.h&gt;`) で使用される型を定義します。

|タイプ |幅 |揮発性|サイン |何のために |
| :--- | :--- | :--- | :--- | :--- |
| `s8` `/` `s16` `/` `s32` | 32/8/16 |はい |記号付き |数学 |
| `u8` `/` `u16` `/` `u32` | 32/8/16 |そうではない | | なしデータ、色、アドレス |
| `vu8` `/` `vu16` `/` `vu32` | 32/8/16 | **はい** | | なしハードウェアログ |
| `int` | 32 |そうではない | |付きループとデフォルトの算術演算 |

スクリプト内で尊重する必要があるテンプレートの規則:

- **デフォルトではすべて 32 ビットです。** `long` をむやみに使用しないでください。`int` のコストは同じで、より簡単です。
- 登録色と値は`u16`です。
- アクターの位置は「s16」です (範囲 ±32767。それを超えると、なぜ壊れるのか疑問に思うでしょう)。
- テンプレートの静的関数はスクリプト セクションの **上** で定義されているため (同じファイル、同じスコープ)、スクリプトから呼び出すことができます。プロトタイプは必要ありません。
- ブロックはファイル レベルで存在するため、スクリプト内の「静的」シンボル (補助変数) は完璧です。

### コード内に表示されるセクション属性
```c
static u16 gActorBack[240*160] __attribute__((section(".ewram"), aligned(4)));
```
-
 `section(".ewram")` → BSS ではなく EWRAM (256 KB) にバッファを配置します。 240×160×2 = 76,800 B は、スタックルート IWRAM には適合しません。
- `aligned(4)` → 効率的なミッドワードアクセス。

ヒント: 独自の大きなバッファ (ミニテキスト バッファなど) には、同じ属性を適用します。ローカルに宣言すると、スタックが爆発します (32 KB)。

---

##10.8。アクター システム (ゲーム エンティティ)

### `GBActor` 構造体
```c
typedef struct {
  s16 x, y;         // posición top-left del sprite EN PANTALLA (relativa a cámara)
  s16 z;            // orden de dibujo: menor z se dibuja primero (atrás)
  u16 w, h;         // tamaño del sprite
  u8 hasCollider;   // 1 = participa en colisiones (y hace que updatePlayer lo mueva)
  u16 cw, ch;       // tamaño del collider (el editor lo centra en el sprite por defecto)
  s16 cox, coy;     // desplazamiento px del collider respecto al centro del sprite (Offset X/Y del inspector)
  s16 vx, vy;       // velocidad en px/vsync (la usan las primitivas de movimiento)
  s8 face;          // 1 mira a la derecha, 0 a la izquierda (lo pone el D-pad)
  u8 coyote;        // vsyncs desde el último suelo (salto con margen)
  u8 jumpBuf;       // vsyncs que un salto queda pendiente de aterrizaje
  u8 jumpHeld;      // A sigue pulsado (para armar el buffer solo al pulsar)
  const GBAFrame* frames[32];  // punteros a frames de la animación
  u16 delays[32];              // duración de cada frame EN VSYNCS
  u8 frameCount;               // nº de frames
  u8 mode;                     // 0=once, 1=loop, 2=pingpong
  u8 frame;                    // frame actual
  s8 dir;                      // +1/-1 (para pingpong)
  u16 timer;                   // contador interno de vsyncs de la animación
  u8 animSpeed;                // paso por vsync del avance (0/1 = cadencia exacta, 2+ = más rápido)
} GBAActor;
```
「GBAフレーム」は次のとおりです。
```c
typedef struct {
  const u16* img;  // píxeles RGB555; bit15=1 => transparente
  u16 w, h;
} GBAFrame;
```
### グローバルリスト
```c
#define ACTOR_COUNT  <n>        // 1..64
#define PLAYER_INDEX 0          // el actor 0 es "el jugador"
#define MAX_ACTOR_FRAMES 32
#define CAM_X 0                 // offset de cámara (si lo configuraste)
#define CAM_Y 0

static GBAActor gActors[ACTOR_COUNT];
```
### 俳優のライフサイクル

1. **`initActors()`** (`sceneInit` 内): アクターを配置し、プール内の画像に `frames[]` と `delays[]` をフックし、`mode`、`hasCollider`、`cw/ch` を設定します。
2. **`advanceAllActors()`** (フレームごと): `frameCount > 1` の場合、`timer` をインクリメントします。 `timer >= Delays[frame]` の場合、`mode` に従って `frame` を進めます。
   - `モード 0` (*1 回*): `frameCount-1` まで進み、そのままになります。
   - `モード 1` (*ループ*): `(frame+1) % FrameCount`。
   - `モード 2` (*pingpong*): `dir` に従って交互に上昇/下降します。
3. **`updatePlayer()`** (フレームごと、`gActors[PLAYER_INDEX].hasCollider == 1` の場合のみ): **プレイヤーにスクリプトが割り当てられている場合を除き** (この場合、スクリプトは `script_update` によって移動されます)、他のアクターをプッシュします。 (セクション9、10、および10.14を参照)。
4. **`drawAllActors(screen)`** (各フレーム): `z` でソートし、`drawActorRect` を 1 つずつ描画します。

### アニメーションのリズムと `animSpeed`

`advanceAllActors()` は各アクターの `timer` を進め、`timer >= late[frame]` の場合に次の `frame` に移動します。つまり、次のようになります。

- **ベース速度**: フレームごとの `delays[frame]` vsync (エクスポーターはスプライトの各フレームの継続時間からエディターで計算します)。 6 vsync → 10 fps アニメーションの遅延あり。
- **`animSpeed`** (actor フィールド、`0/1` = 通常): vsync ごとに、`timer` は 1 ではなく `animSpeed` ティックだけ進みます。これはスクリプトによって記述され、それに触れるアクターにのみ影響します。- **自動加速はありません**: モーターは、移動する人の速度を上げません (ウォーカーも NPC も)。正確なケイデンス以外の速度はコードから取得されます。

#### 歩くときだけ歩幅を早める

一般的な用途は、歩行者の動きに伴うアニメーションです。 `script_update` では、`gSelf` で移動中に `animSpeed` を上げ、解放時に `1` に戻します。
```c
static void script_update(void) {
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  if (keys & (KEY_UP | KEY_DOWN | KEY_LEFT | KEY_RIGHT)) {
    moveTopDown(gSelf, keys);     // o moveActorCollide / movePlatformer
    gSelf->animSpeed = 2;         // zancada ×2 SOLO mientras este actor camina
  } else {
    gSelf->animSpeed = 1;         // cadencia exacta al parar
  }
}
```
これは、「animSpeed」をタップしたアクターのアニメーションのみを変更します。世界が動いても、シーンの残りの部分は正確なリズムで継続します。

### To コード例: プレーヤー アクターの読み取り
```c
void script_update(void) {
  GBAActor* p = &gActors[PLAYER_INDEX];
  p->x += 1;            // mueves 1 px por frame (60 px/s)
}
```
**スクリプトからのアクター API ヒント:**

- `script_update` の各ラウンドは、`advanceAllActors`/`updatePlayer` の **後**、および `drawAllActors` の前**に実行されます。つまり、アニメーション化された状態を読み取ると、変更は同じフレーム内に描画されます。
- アニメーションの特定のフレームに「ジャンプ」するには: `a->frame = k; a->タイマー = 0;`
- 別のアニメーション (別のフレームのセット) を使用するには、`a->frames[i]` を再マップする必要があります。現在のバージョンのエクスポートでは、セットは「initActors」に設定されています。 `a->frame` と `a->mode` を変更したり、アクター間でフレームを共有したりできます (プールにより画像の重複が除去されます)。
- `z` は誰が誰をカバーするかを制御します。 「深度クラス」効果については、任意に (フレームごとでも) 変更できます。
- `vx`/`vy` は **無料** フィールドです。独自の物理 (重力、障害物、NPC) に使用してください。

---

##10.9。入力: 読み取りボタン

### `REG_KEYINPUT` の真実

`REG_KEYINPUT` は、`0x04000130` にある読み取り専用の 16 ビット レジスタです。

**ビット = 0 はボタンが押されたことを意味します** (低レベルのためアクティブ)。ビット = 1 は緩んでいることを意味します。

|ビット |ボタン |ビット |ボタン |
| :--- | :--- | :--- | :--- |
| 0 | **A** | 5 | **←** (左) |
| 1 | **B** | 6 | **↑** (上) |
| 2 | **選択** | 7 | ***↓** (下) |
| 3 | **開始** | 8 | **R** |
| 4 | **→** (右) | 9 | **L** |

ビット 10 ～ 15 は配線されていません (無視し、読み取らないでください)。> ⚠️ **実際の G​​BA マップ** (`b0=A, b1=B, b2=SELECT, b3=START, b4=RIGHT, b5=LEFT, b6=UP, b7=DOWN, b8=R, b9=L`) です。混同しないでください。逆のコンテキストでは、プレーヤーが後ろ向きに歩くことになります。非常によくあるバグになります。

### 「ボタンが押された」の標準パターン
```c
u16 keys = ~REG_KEYINPUT & 0x3FF;   // invertir bits + enmascarar a los 10 botones
if (keys & (1 << 0)) { /* A pulsado */ }
if (keys & (1 << 4)) { /* derecha */ }
```
テンプレートには、手動でシフトをカウントしないように、ボタンがすでに定数でマスクされています。
```c
#define KEY_RIGHT 0x010
#define KEY_LEFT  0x020
#define KEY_UP    0x040
#define KEY_DOWN  0x080
#define KEY_A     0x001
#define KEY_B     0x002
#define KEY_SHOULDER 0x300   // R y L a la vez (correr)

if (keys & KEY_RIGHT) { /* derecha */ }
```
そして、`movePlayer()` は [`moveTopDown`](#move-primitives-ready-to-use) でプレーヤーを移動します。

### 「押したばかり」を検出 (エッジ: エッジ/立ち上がり)

十字キーを「押し続ける」と各フレームを移動します。 **押されたフレーム内のみ**にジャンプまたは射撃するには、前の状態を保存します。
```c
static u16 prevKeys = 0;

void script_update(void) {
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  u16 justPressed = keys & ~prevKeys;    // 1 en botones recién pulsados
  u16 justReleased = prevKeys & ~keys;   // 1 en botones recién soltados
  prevKeys = keys;

  if (justPressed & (1 << 0)) { /* acción de salto: se dispara UNA vez */ }
}
```
### 同時制御と優先制御

- `justPressed` はビットのセットです: **組み合わせ**を要求できます:
```c
if ((justPressed & (1 << 0)) && (justPressed & (1 << 1))) { /* A+B */ }
```
-
 コード内で優先順位を決定します。「if / else if」は、「スパイク」を引き起こす複数の独立したチェックよりも予測可能です。

---

##10.10。移動と衝突

### 座標とカメラ

テンプレートの世界では、エンジンが 240×160 の固定画面用に設計されているため、各アクターは **画面上** の位置 (`x, y`) を保存します。 `CAM_X/CAM_Y` は衝突にワールド オフセットを追加します。
```c
// Coordenadas del collider en el MUNDO:
static inline void actorBox(const GBAActor* a, s16* bx, s16* by, s16* bw, s16* bh) {
  *bw = a->cw ? a->cw : a->w;
  *bh = a->ch ? a->ch : a->h;
  *bx = a->x + CAM_X + (a->w - *bw) / 2;   // collider centrado
  *by = a->y + CAM_Y + (a->h - *bh) / 2;
}
```
-
 ワールドインスペクターでアクターに **コライダー** がある場合、テンプレートは `cw/ch` にそのサイズ (そうでない場合はスプライトのサイズ) を埋めます。コライダーはスプライトの**中心**に配置されます。

### コリジョン マップとそのタイル タイプ

シーンにコリジョン マップ (ワールド モジュールで編集) がある場合、テンプレートは次のものを出力します。
```c
#define COLLISION_COLS ...
#define COLLISION_ROWS ...
#define COLLISION_TILE_SIZE 8   // tamaño de tile, en px
#define CAM_X ...
#define CAM_Y ...
const u8 collisionMap[ROWS][COLS] = { ... };
```
**マップ上のタイル値** (`solidTile` による):

|値 |タイプ |ブロック |
| :--- | :--- | :--- |
| `0` |空 |何も |
| `1` |固体 |いつも |
| `2` |一方通行 ↑ | **落下** (Ydir > 0) の場合のみ |
| `3` |一方通行↓ | **up** (dirY < 0) の場合のみ |
| `4` |一方通行 ← | **右のみ** (Xdir > 0) |
| `5` |一方通行 → | **左**にのみ進みます (Xdir < 0) |
| `6` |階段 |可（ブロックしない） |
```c
static inline u8 solidTile(u8 v, int dirX, int dirY) {
  if (v == 1) return 1;                      // sólido
  if (v == 2) return dirY > 0;               // one-way up: bloquea cayendo
  if (v == 3) return dirY < 0;               // one-way down: bloquea saltando
  if (v == 4) return dirX > 0;               // one-way left: bloquea a la derecha
  if (v == 5) return dirX < 0;               // one-way right: bloquea a la izquierda
  return 0;
}
```
### `rectHitsSolid` と `moveActorCollide
```
`c
// ¿El rectángulo de mundo (bx,by,bw,bh) toca algún tile sólido PARA la
// dirección (dx,dy)?
static inline int rectHitsSolid(s16 bx, s16 by, s16 bw, s16 bh, s16 dx, s16 dy);

// Mueve un actor resolviendo eje por eje (X e Y por separado):
// se mueve, comprueba, y si choca, revierte.
static void moveActorCollide(GBAActor* a, s16 dx, s16 dy);
```
`moveActorCollide` は最高のツールです。これを使用すると、壁の上をスライドできます (対角線上でスタックすることはありません)。 **小さな変位** (フレームあたり 2 ～ 4 ピクセル) で使用します。

### 俳優と俳優のプッシュ
```c
static void updatePlayer(void) {
  GBAActor* p = &gActors[PLAYER_INDEX];
  if (!p->hasCollider) return;            // sin collider no mueve nada
  keys = ~REG_KEYINPUT & 0x3FF;
  movePlayer(keys, p);                     // = moveTopDown(p, keys)
  // ... empuja a cualquier otro actor con collider usando el eje de
  // menor intrusión (AABB)
}
```
つまり、プレイヤーは他のプレイヤーを**プッシュ**します(両方ともコライダーを持っている場合)。 NPC がそれを行わないように、彼に `hasCollider = 0` を持たせます (または、NPC だけが衝突しません)。 *全員* が互いにプッシュしたい場合は、スクリプト内でそのループを複製します。

### 整数を使用した手動物理学 (浮動小数点を使用しない重力)

`vx/vy` とコライダーを使用した、NPC の「単純な重力」物理の例:
```c
void script_update(void) {
  GBAActor* e = &gActors[1];       // un "enemigo"
  if (!e->hasCollider) return;

  e->vy += 1;                       // gravedad: +1 px/vsync²
  if (e->vy > 4) e->vy = 4;         // velocidad terminal
  moveActorCollide(e, 0, e->vy);    // colisión vertical (aplica suelo/techo automáticamente)

  // patrulla: rebota en paredes
  if (e->vx == 0) e->vx = 1;
  if (e->vx > 0) moveActorCollide(e, 1, 0); else moveActorCollide(e, -1, 0);
}
```
> 位置は整数であるため、「フレーム 2 乗あたり 1 ピクセル」の重力は 60 fps で正常に機能します。 2 の累乗でない場合は、`/=2` で重複すると主張しないでください ([16](#1016-optimization-and-golden-rules) を参照)。

### 動きのプリミティブ (すぐに使える)

ゲームごとに物理を手動で記述するのは繰り返し作業なので、テンプレートには **すでに解決されている 2 つのプリミティブ**が付属しており、それらを呼び出すだけで済みます。これらはプレハブの「ベース」や「レベル」ではありません。レベルはすでにタイル マップであり、プラットフォーマーとトップダウン迷路の間で唯一異なるのは、何をプリミティブと呼ぶかだけです。

**すべてが `#define`s** でラップされているため、動作は 1 つのサイトで変更され、すべてのスクリプトに影響します。
```c
#define WALK_SPEED 2        // px/vsync horizontal máximo
#define RUN_SPEED 3         // con R/L (shoulder)
#define ACCEL 1             // aceleración horizontal (1 = respuesta inmediata)
#define FRICTION 1          // frenada en suelo
#define GRAVITY 1           // px/vsync² (entero: en GBA no hay floats)
#define MAX_FALL 5          // velocidad máxima de caída
#define JUMP_VEL -11        // impulso del salto (negativo = hacia arriba)
#define COYOTE_FRAMES 5     // vsyncs de margen tras salir de la plataforma
#define JUMP_BUFFER 5       // vsyncs que un salto espera a que haya suelo
#define JUMP_CUT_VEL -3     // salto corto: soltar A corta la subida
```
#### `movePlatformer(actor, key)` — プラットフォーム
```c
static void movePlatformer(GBAActor* a, u16 keys);
```
重力 + ジャンプ「Orphan Knife より」。ジャンプを快適にする 3 つの補助を備えています。

- **コヨーテ時間**: プラットフォームから出たばかりの場合でも、「COYOTE_FRAMES」中にジャンプできます。エッジを離れた後、フレームの途中で A を押すとジャンプがカウントされます。
- **ジャンプ バッファ**: 地面に触れる前に、「JUMP_BUFFER」が vsync するまで A を押すと、ジャンプが保存され、着地時にトリガーされます。 「押すのが遅かったのに飛ばなかった」という事態を避けましょう。
- **可変ジャンプ**: 上昇中に A を放すと、速度が `JUMP_CUT_VEL` まで下がります。長押し = ハイジャンプ。ワンタッチ＝ショートジャンプ。
- **一方通行**タイルは落下している場合にのみブロックするため、それらを通り抜けることができます。

完全なプラットフォーム スクリプトは文字通り次のとおりです。
```c
void script_update(void) {
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  movePlatformer(gSelf, keys);
}
```
#### `moveTopDown(actor, key)` — 迷路 / RPG / メニュー
```c
static void moveTopDown(GBAActor* a, u16 keys);
```
**重力なし**で、加速とブレーキを備えた 4 方向。 `R`/`L` で実行します。
```c
void script_update(void) {
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  moveTopDown(gSelf, keys);
}
```
アクターがタイルに衝突した場合、その速度は 0 に設定されます (最大ロード速度で壁に「スタック」しないようにするため)。

#### `onFloor(actor)` — 床の上にありますか?
```c
static int onFloor(GBAActor* a);
```
コライダーの下のタイルを見てください。独自の決定に役立ちます (パトロール、地上のみで移動する敵、「空中」アニメーション):
```c
void script_update(void) {
  GBAActor* e = &gActors[1];
  if (onFloor(e) && (REG_KEYINPUT & 0x200) == 0) {
    // solo patrulla si toca suelo
  }
}
```
> **それらの使用を強制するものはありません。** プリミティブがゲームに適合しない場合は、それを無視し、前のセクションで説明した `moveActorCollide` を使用して `gSelf` を手動で移動します。彼らはあなたに性別を押し付けるのではなく、物理学の90％を救うためにそこにあります。


### テレポートと制限
```c
p->x = 100; p->y = 80;      // la posición se aplica ANTES del draw del frame
// si reciclás a fuera de pantalla, recuerda drawActorRect hace clamp y lo ignora
// (baja coste), pero volverá visible al read-regresar.
```
--
-

##10.11。サウンド: GBA APU

### APU の概要

4 つの効果的な合成チャンネル (さらに、エンジンが使用しない PCM サンプルの DMA):

|チャンネル |名前 |合成 |
| :--- | :--- | :--- |
| 1 | **1 を押してください** |方形波 + 周波数掃引 (スイープ) |
| 2 | **2 を押してください** |方形波 (掃引なし) |
| 3 | **波** | 16 の 4 ビット サンプル (波形 RAM) |
| 4 | **騒音** |擬似ランダムノイズ |

### `noteOn()`: ノートを再生する関数

このテンプレートは、(プロジェクトのサウンド エディター用に) 関数 `noteOn(int ch, const GBAInst* inst, u16 period)` と周期テーブルを生成します。
```c
// De la frecuencia (Hz) al valor de registro:
// period ≈ round(2048 - 131072 / freq)
const u16 gNotePeriods[96] = { ... };   // C1..B8

typedef struct {
  u8 volume;    // 0-15
  u8 duty;      // relación de la onda cuadrada (0-3)
  u8 envDir;    // 0=decay, 1=attack
  u8 envSweep;  // rápidez del cambio de volumen (0-7)
  u8 sweepShift;// 0-7 (si 0, no hay barrido)
  u8 sweepTime; // 0-7
  u8 sweepDir;  // 0=down, 1=up
} GBAInst;
```
「noteOn」が適用されるのは次のとおりです。
```c
static void noteOn(int ch, const GBAInst* inst, u16 period) {
  u16 dutyVal  = (inst->duty & 3);
  u16 envVal   = ((inst->volume & 0xF) << 11)
               | ((inst->envDir & 1) << 8)
               | ((inst->envSweep & 7) << 4);
  u16 freqVal  = 0xC000 | (period & 0x07FF);   // frecuencia + key-on en bit 14
  switch (ch) { ... /* escribe REG_SND1/2/3/4* */ }
}
```
### デューティ サイクル (方形波)

「デューティ」フィールド (0 ～ 3) は、波形の高低比を制御します。

|義務 |波 |ラウドネス |
| :--- | :--- | :--- |
| 0 | 12.5% |素晴らしいフルート、「トゥトゥ」 |
| 1 | 25% |より多くの鼻の音色 |
| 2 | 50% |クラシック方形波 (曲) |
| 3 | 75% | 25% 反転に似た着信音 |

### スクリプトから SFX を再生する

実践的な戦略: BGM が再生されない限り **チャンネルを盗み**、プロジェクトに曲がない場合は独自のサウンドを追加します。チャンネル 2 の衝撃的なミニ SFX:
```c
// Un disparo corto en el canal 2 (pulse), una sola vez al pulsar A
static u32 sfxTimer = 0;

static void playImpact(void) {
  GBAInst sfx;
  sfx.volume = 12;
  sfx.duty = 1;
  sfx.envDir = 0;       // decay
  sfx.envSweep = 6;     // cae rápido
  sfx.sweepShift = 0;   // sin sweep de frecuencia
  sfx.sweepTime = 0;
  sfx.sweepDir = 0;
  noteOn(1, &sfx, (u16)(2048 - 131072 / 880)); // ~880 Hz (A5)
}

void script_update(void) {
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  if (keys & (1 << 0)) {   // A
    playImpact();
    REG_SND2FREQ = 0;      // luego lo apagamos (o deja que decay haga el resto)
  }
}
```
> プロジェクトに BGM がある場合、チャンネル 1 ～ 4 はシーケンサーによって占有されます。クラッシュせずに独自の SFX を実現するには、その時点で曲のチャンネルを下げるか、**チャンネル 4 (ノイズ)** をパーカッション/ビートに再利用します。これは最も邪魔になりません。専用の SFX は将来のバージョンで予定されています。

### チャンネル 3 波形 RAM
```c
static void initWaveRAM(void) {
  vu16* wave = (vu16*)0x04000090;
  const u16 waveData[8] = { 0x0123,0x4567,0x89AB,0xCDEF, 0x0123,0x4567,0x89AB,0xCDEF };
  int i;
  for (i=0;i<8;i++) wave[i] = waveData[i];
}
```
16
 個の 4 ビット サンプル。テンプレートはそれらを `initSound()` にロードします。ここで独自の波形を定義することで、チャンネル 3 にさまざまな音色 (三角波やソフト四角形など) を作成できます。

### 一般的な `initSound()` の値
```c
REG_SNDBIAS = 0x200;      // sesgo correcto del DAC (136' ciclo)
REG_SNDCNTX = 0x0080;     // volumen del sonido al 100% (canal master)
REG_SNDCNTH = 0x0002;
REG_SNDCTL  = 0xFF77;     // Master: full, y enable de los 4 canales
REG_SND3CNT_L = 0x0080;   // wave al 100%, sin output tweak
REG_SND3CNT_H = 0x0001;
initWaveRAM();
```
### 歌とタイムループ

プロジェクトに音楽がある場合、テンプレートは「SONG_BPM...」、「SONG_STEPS...」、曲の定数、および以下を生成します。
```c
while (1) {
  waitVSync();
  accum += SONG_BPM_Scene;
  if (accum >= 900) {          // avanza un "paso" (16th de compás)
    accum -= 900;
    playStep_Scene(step);      // toca las notas del paso
    step++; if (step >= SONG_STEPS_Scene) step = 0;
  }
  advanceAllActors(); updatePlayer(); userScriptsUpdate(); drawAllActors(screen);
}
```
BPM
=900 の場合、1 ステップは 1 フレームと一致します (60 ステップ/秒)。別のテンポが必要な場合は、スレッショルドではなくアキュムレータを変更します。

---

##10.12。フレーム、vsync、アニメーション

エンジン タイミング システム全体は **vsyncs = フレーム** に基づいています。

- `waitVSync()` はループごとに 1 回呼び出されます。ループ → **1 フレーム = 1/60 秒**。
- `delays[i]` は、アニメーションの各フレームが持続する vsync の数を保存します。インスペクターでは、エンジンはミリ秒→ vsync (`round(ms*60/1000)`) を **変換** します。
- スクリプトからの独自のアニメーションの場合は、同等のことを実行します。フレーム カウンターを使用し、タッチしたときに `a->frame` を変更します。
```c
// Parpadeo cada 30 frames (0,5 s)
static u16 blink = 0;
void script_update(void) {
  GBAActor* a = &gActors[1];
  if (++blink < 30) a->frame = 0;
  else if (blink < 60) { a->frame = 1; if (blink >= 60) blink = 0; }
}
```
**経験則:** 手動で遅延をミリ秒単位で設定しないでください。 vsync をカウントします (「u16 タイマー」)。 **他のスレッドが存在しない**ため、ブロッキング「delay(500)」によりゲームがフリーズしたままになります。スクリプトとレンダラーは同じフレームを共有します。

---

##10.13。スクリプトのダイレクト C: コントラクトと API

### コードを挿入する方法

`cCode` フィールドが空ではない **Direct C** モード スクリプト、`gba_export.ts` を使用してエクスポートする場合:

1. **逐語的** コード (そのまま、`\n` `\n`) を `main.c` 内のセクション `// ── ユーザー スクリプト (ダイレクト C) ──` **前** `int main()` に配置します。
2. 2 つのディスパッチャーを生成します。
```c
static void userScriptsInit(void) {
  script_init();          // si existe EXACTAMENTE 1 definición
  // o: // script_init(): N definiciones — sin llamada
}
static void userScriptsUpdate(void) {
  script_update();
}
```
3
. `sceneInit()` 内で (`initActors()+drawAllActors` の後) `userScriptsInit()` を呼び出し、ゲーム ループの**各ターン**で `userScriptsInit()` を呼び出します (アクターあり、音楽あり、そしてアクターがいない場合も!)。これが、`script_update` が常に 60 fps で実行される理由です。

### 正確な契約書
```c
void script_init(void) {
  //  1 vez, al entrar en la escena (después de que los actores estén colocados).
}
void script_update(void) {
  //  cada frame del juego, justo antes del drawAllActors.
}
```
-
 **どちらもオプションです。** `script_update` を定義しない場合、スクリプトはセットアップされるだけです。何も定義しない場合、エクスポートによってすでに警告が表示されます。
- **それぞれの定義が 1 つだけ存在する必要があります**。複数 (または同じ機能を持つ複数のスクリプト) がある場合、エンジンはそれらのいずれも呼び出しず、エクスポート コンソールに警告が表示されます。このような `cCode` では、重複したシンボルを定義すると、コンパイラは重複したシンボルを返します。
- 契約がよく理解されるように: **ブロック内またはパラメータとともに `void script_update(void)` を書かないでください**。これは、検出器が検出する正確な形状です (許容範囲内のスペースがあります)。

### スクリプト内で利用できるもの (完全な API)

ファイル内で既に定義されているすべてのもの (「静的」の場合は静的) にアクセスできます。

- `gActors[ACTOR_COUNT]`、`GBAActor`、`GBAFrame`、`PLAYER_INDEX`、`CAM_X/CAM_Y` (シングルシーン。マルチシーンでは `gCamX/gCamY` です。[10.15](#1015-various-scenes-in-rom-switchscene-near-y-gjp) を参照)、 「MAX_ACTOR_FRAMES」。
- `moveActorCollide(a, dx, dy)`、`movePlayer(u16 キー、GBAActor* p)`、`updatePlayer()`、`actorBox()`、`rectsOverlap()`、`rectHitsSolid()` (マップの場合)、`solidTile()`、`advanceAllActors()`、 `initActors()`。
- **プリミティブの移動:** `moveTopDown(a, key)`、`movePlatformer(a, key)`、`onFloor(a)`、`approach(&v, target, step)`。
- **複数のシーン:** `switchScene(n)`、`near(a, b, dist)`、`gJp`、`gScene` ([10.15](#1015-multiple-scenes-in-the-rom-switchscene-near-y-gjp) を参照)。- ボタン: `KEY_A`、`KEY_B`、`KEY_UP`、`KEY_DOWN`、`KEY_LEFT`、`KEY_RIGHT`、`KEY_SHOULDER`。
- `REG_KEYINPUT` (`0x04000130`)、正しいビットマップ ([9](#109-input-read-the-buttons) を参照)。
- **ダイアログ:** `showDialogue(id)`、`nextDialogueRow()`、`hideDialogue()`、`gLang` ([10.13.1](#10131-dialogues-and-langages) を参照)。
- **メニュー:** `menuOpen(count)`、`menuClose()`、`menuSetItem(i, text)`、`menuSetBox(x,y,w,h)`、`menuSetFont(f)`、`menuSetBoxSprite(db)`、`menuSelected()`、`menuVisible()`、`menuUpdate()` (を参照) [10.13.2](#10132-menus-markets-inventory-store))。
- `SCREEN_W=240`、`SCREEN_H=160`、`PIXEL_COUNT=38400`、`screen` はシンボルとして**ではありません**。ペイントしたい場合は `(u16*)VRAM` を使用してください。
- `REG_SND1..4*`、`noteOn()`、`GBAInst`、`gNotePeriods` (プロジェクトにサウンドがある場合)。
- `waitVSync()`。
- 条件を定義します: `ACTOR_COUNT`、`COLLISION_*` (マップがある場合)。

### 10.13.1。対話と言語

プロジェクトにダイアログがある場合、エンジンは次の関数とグローバル変数をエクスポートします。
```c
void showDialogue(int id);            // muestra el diálogo `id` desde la fila 0
void showDialogueRow(const char* key); // salta a una fila por su código o su ID
void nextDialogueRow(void);           // avanza a la siguiente fila (si está visible)
void hideDialogue(void);              // oculta el diálogo
void dialogueUpdate(void);            // avanza solo al pulsar A (llámala cada frame)
extern int gLang;                     // idioma activo: 0 = primera columna, 1 = segunda, …
```
-
 `id` は、行の ID ではなく、**エディター内のダイアログの順序** (0、1、2...) です。
- `showDialogueRow(key)` は、**コード フィールド** または **完全 ID** が `key` と一致する最初の行を検索し、表示します。何も見つからない場合は、何も行われません。
- 表示されるテキストは `text[row][gLang]` です。言語を選択するには、`showDialogue`/`showDialogueRow` の前の `gLang` を変更します (インデックスは Dialogue テーブルの列の順序に従います)。
- **アクター別のボックス**: ボックスは、アクターで設定した画像、位置、サイズで描画されます (ワールド → テキスト アクター → ダイアログ ボックス)。アクターにボックスがない場合は、デフォルトでボックスが使用されます。
- **行ごとのフォント**: 各行は、ダイアログ テーブルの「フォント」列で選択されたフォントを使用します。
- **スピーカー**: 行の「名前」フィールドがボックスの上に描画されます。
- **行ごとのサウンド**: 行にサウンドが割り当てられている場合、表示時にそのサウンドが再生されます。
- ダイアログが非表示の場合、`nextDialogueRow()` と `hideDialogue()` は何も行いません。
```c
void script_update(void) {
  gLang = 1;                              // 0 = primer idioma, 1 = segundo
  if (gJp & 8) showDialogueRow("saludo"); // START: fila por código
  dialogueUpdate();                       // A: siguiente fila (auto)
  if (gJp & 2) hideDialogue();            // B: ocultar
}
```
行の完全な ID を使用することもできます: `showDialogueRow("新しいダイアログ 3-002-1")`。

### 10.13.2。メニュー（市場、在庫、店舗）

スクリプトの一般的なメニュー: エンジンは、選択したダイアログ ボックス (または任意のボックス) と配置したフォントを使用して、フレームごとに **アクターの上** にメニューを描画します。最大8項目まで。
```c
void menuOpen(int count);            // abre el menú con `count` ítems (0..8)
void menuClose(void);                // ciérralo
void menuSetItem(int i, const char* text); // texto del ítem i
void menuSetBox(int x, int y, int w, int h); // posición/tamaño de la caja
void menuSetFont(int font);          // fuente (0 = la primera del proyecto)
void menuSetBoxSprite(int db);       // caja de diálogo a usar (0 = la primera)
int  menuSelected(void);             // ítem resaltado (0..count-1)
int  menuVisible(void);              // 1 si el menú está abierto
void menuUpdate(void);               // mueve la selección con ARRIBA/ABAJO (auto)
```
-
 選択範囲はエンジンによって移動されます (「menuUpdate」はフレームごとに単独で呼び出されます)。スクリプトは `menuSelected()` を読み取って、A/B をどうするかを決定するだけです。
- メニューはゲームを**一時停止しません**。アクターはアニメーションを継続します。プレーヤーをフリーズしたい場合は、メニューが開いている間は動かさないでください。
- ハイライトされた項目は、左側に「>」を付けて描画されます。

例 (3 つのアイテムを販売する NPC):
```c
static int state = 0;                // 0 = espera, 1 = diálogo, 2 = mercado
static int gold = 100;
static const int price[3] = {10, 50, 30};
static const char* item[3] = {"POCION 10 ORO", "ESPADA 50 ORO", "ESCUDO 30 ORO"};

void script_update(void) {
  if (state == 0) {
    if (near(gSelf, &gActors[PLAYER_INDEX], 30) && (gJp & KEY_A)) { showDialogue(0); state = 1; }
  } else if (state == 1) {
    if (gJp & KEY_A) nextDialogueRow();
    if (!gDialogueVisible) {
      state = 2;
      menuSetFont(0); menuSetBoxSprite(0); menuSetBox(8, 8, 150, 44);
      for (int i = 0; i < 3; i++) menuSetItem(i, item[i]);
      menuOpen(3);
    }
  } else {
    if (gJp & KEY_A) {
      int s = menuSelected();
      if (gold >= price[s]) gold -= price[s];
    }
    if (gJp & KEY_B) { menuClose(); state = 0; }
  }
}
```
### 10.13.3。 SRAMに保存

このエンジンには、カートリッジの SRAM (「0x0E000000」) に保存システムが含まれており、破損したゲームや別のバージョンを検出するためのマジック、バージョン、チェックサム (FNV-1a) が含まれています。
```c
int  aeSaveHasGame(void);              // 1 si hay partida guardada válida
int  aeSaveWrite(const u8* data, u32 size); // 0 ok, -1 si no cabe (máx. 256 B)
int  aeSaveRead(u8* data, u32 size);   // 0 ok, -1 si no hay partida
void aeSaveClear(void);                // borra la partida
```
例：
```c
u8 save[128];

// guardar
save[0] = gScene;
save[1] = gActors[PLAYER_INDEX].x;
aeSaveWrite(save, sizeof(save));

// cargar al empezar
if (aeSaveHasGame()) {
  aeSaveRead(save, sizeof(save));
  gScene = save[0];
}
```
-
 ブロックは最大 **256 バイト** (`AE_SAVE_MAX`);さらに必要な場合は、`main.c` の `define` を変更してください。
- SRAM は、エミュレータ (mGBA はそれを `.sav` に保存します) とフラッシュカートでの実行間で保持されます。
- **エミュレータの状態保存(別のもの)と混同しないでください**。
- チェックサムが一致しない場合 (破損したゲームまたは他のバージョン)、`aeSaveHasGame()` は 0 を返し、「ゲームなし」として扱われます。

### コードの必須ルール

|ルール |なぜ |
| :--- | :--- |
| **「float」/「double」なし** | FPU はありません。コンパイラは非常に遅いソフトフロートでシミュレートします。 |
| **「malloc」/「free」なし** |メモリマネージャーはありません。静的を宣言します。 |
| **画面上に「printf」を表示しない** |コンソールはありません。デバッグするには、[17](#1017-debugging) を参照してください。 |
| **ブロッキング無限ループなし** |レンダリングがフリーズします。 vsync ごとにカウンターを使用します。 |
| **VBLANK の外側に VRAM を書き込まないでください** |実機の破れ。 |
| **フレームごとのショートコード** | VBLANK バジェット (約 83.8K サイクル)。 |
| **ファイル I/O がありません** |それは存在しません。ファイルシステムがありません。 |

---

##10.14。すぐにコピーできるスクリプトの例

### 1. D-pad を使用してアクターを移動します (衝突の有無にかかわらず)**プレーヤー/アクター:** スクリプトは、**アクターに割り当てられている** (ワールド → インスペクター → スクリプト) 場合にのみ実行されます。エンジンは、問題のアクターを指すグローバル変数 `GBAActor* gSelf` を使用して、**割り当てられたアクターごとに 1 回**スクリプトを呼び出します。そのアクターを移動するには、`gSelf` を使用します (常にプレーヤーを移動する `gActors[PLAYER_INDEX]` ではありません)。プレイヤーに**スクリプトが割り当てられていない**場合、エンジンは「moveTopDown」を使用して方向パッドのみでプレイヤーを動かします（2 ピクセル/フレーム、タイル衝突あり）。別の速度が必要な場合は「ウォークスピード」を変更します。プレーヤーにスクリプトが割り当てられている場合、そのスクリプトは `script_update` によって移動されます (エンジンは干渉しません)。注意してください: 他のアクター (NPC、敵) からのスクリプトは、プレイヤーから制御を奪いません。

> 近道: 単に動きたいだけなら、物理学を書かないでください。 `movePlatformer(gSelf, Keys)` は完全なプラットフォームを提供し、`moveTopDown(gSelf, Keys)` は迷路を提供します。どちらも衝突があります。 [10.10](#out-of-the-box-motion-primitives) を参照してください。

この例は、コントローラーを備えた **任意のアクター** (プレイヤーまたは NPC) で機能します。 **コリジョン タイルが機能するために重要:** アクタ「+= 2」をベアバックで動かすと、**コリジョン マップを無視します** (コリジョン マップが検出されない → 通過するか、他のアクタの押しにより「速度が低下」します)。タイルと衝突するには、`moveActorCollide()` を使用します。
```c
// Mueve al actor asignado (gSelf) respetando el mapa de colisiones de la escena
void script_update(void) {
  GBAActor* p = gSelf;
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  if (keys & (1 << 5)) moveActorCollide(p, -2, 0); // izquierda
  if (keys & (1 << 4)) moveActorCollide(p,  2, 0); // derecha
  if (keys & (1 << 6)) moveActorCollide(p,  0, -2); // arriba
  if (keys & (1 << 7)) moveActorCollide(p,  0,  2); // abajo
}
```
シーンにコリジョン マップがない場合 (またはクラッシュしたくない場合)、直接バージョンは次のようになります。
```c
void script_update(void) {
  GBAActor* p = gSelf;
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  if (keys & (1 << 4)) p->x += 2;   // derecha (bit4)
  if (keys & (1 << 5)) p->x -= 2;   // izquierda (bit5)
  if (keys & (1 << 6)) p->y -= 2;   // arriba
  if (keys & (1 << 7)) p->y += 2;   // abajo
}
```
> インスペクター内のアクター コライダーは、**actor-actor** プッシュ (`updatePlayer`) と `moveActorCollide` (中央に配置されたコライダー `cw/ch` を使用) にのみ介入します。タイルを尊重する移動の場合、「moveActorCollide」の呼び出しは必須です。

### 2. A を押したときに SFX をトリガーします (1 回)
```c
static u16 prevKeys = 0;
static int shotHeld = 0;

static void playShot(void) {
  GBAInst sfx;
  sfx.volume = 10; sfx.duty = 2; sfx.envDir = 0;
  sfx.envSweep = 5; sfx.sweepShift = 0; sfx.sweepTime = 0; sfx.sweepDir = 0;
  noteOn(1, &sfx, (u16)(2048 - 131072 / 440));
}

void script_update(void) {
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  u16 justPressed = keys & ~prevKeys;
  prevKeys = keys;
  if (justPressed & (1 << 1)) playShot();   // A (bit1)
}
```
### 3. 巡回して端に到達するとテレポートする敵
```c
void script_update(void) {
  GBAActor* e = &gActors[1];
  e->x += 1;
  if (e->x > 230) e->x = -21;   // fuera de cámara por la izquierda
}
```
### 4. アクターのアニメーション (フレーム/モード) を変更する
```c
void script_update(void) {
  GBAActor* p = &gActors[PLAYER_INDEX];
  if (p->x % 20 < 10) { p->frame = 0; }
  else                 { p->frame = 1; }
  p->timer = 0;   // reinicia el contador para que no "salte" solo
}
```
### 5. 氷の物理学: 整数による慣性 (浮動小数点数なし)
```c
static s16 vx = 0;
void script_update(void) {
  GBAActor* p = &gActors[PLAYER_INDEX];
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  if (keys & (1 << 4)) vx += 1;
  if (keys & (1 << 5)) vx -= 1;
  vx -= vx / 8;             // fricción aproximada (divisible por potencia de 2)
  if (vx > 4)  vx = 4;
  if (vx < -4) vx = -4;
  p->x += vx;
}
```
### 6. 完全なプラットフォーム (重力、ジャンプ、コヨーテ、バッファー)
```c
void script_update(void) {
  GBAActor* p = gSelf;
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  movePlatformer(p, keys);   // todo el trabajo, una línea
}
```
プリミティブが存在する前は、これは `vy += GRAVITY` の約 20 行で、`MAX_FALL` まで飽和し、手動で地面を検出し、`vy == 0` がジャンプするのを観察しました。これはもう必要ありません。`movePlatformer` がそれを実行し、コヨーテ時間、ジャンプ バッファー、および変数ジャンプも追加します。 [10.10](#movement-primitives-ready-to-use)の`#define`をタッチして動作を調整します。

アクターが重力はあるが手動で制御する NPC (ボールや落下する敵など) の場合は、`onFloor` を使用して地面に触れたかどうかを確認します。
```c
static u8 prevFloor = 0;
void script_update(void) {
  GBAActor* p = gSelf;
  p->vy += 1;
  if (p->vy > 5) p->vy = 5;
  moveActorCollide(p, 0, p->vy);
  u8 suelo = onFloor(p);
  if (suelo && !prevFloor) p->vy = 0;   //acaba de tocar suelo: anula la caída
  prevFloor = suelo;
}
```
> `onFloor` はコライダーの下にある 1 つのタイルを落下方向に見るため、残りの物理演算と同様に一方向のタイルを尊重します。

### 7. N 秒ごとのフレームカウンターと条件
```c
static u32 tick = 0;
void script_update(void) {
  tick++;
  if (tick % 180 == 0) {   // cada 3 s (180/60)
    GBAActor* p = &gActors[PLAYER_INDEX];
    p->y -= 20;            // pequeño salto
  }
}
```
--
-

##10.15。 ROM 内のさまざまなシーン: `switchScene`、`near`、`gJp`

エクスポートでは、**すべてのプロジェクト シーン**が ROM に埋め込まれます。開始シーンは、スプラッシュが次のように定義したシーンです。ゲーム中のシーン変更はスクリプト呼び出しです。

### シーンの番号の付け方

シーン インデックスは **エディタ内の順序** (ワールド シーンのリスト、上から下) です。シーン 0 が最初で、シーン `N-1` が最後です (N = 合計)。名前には依存しません。エディタの **接続** がエクスポートされます。これらは、シーンを変更するときに再生されるトランジションを定義します (下記を参照)。

- `gScene` — 現在のシーンのインデックス (読み取り)。
- `switchScene(n)` — シーン `n` への切り替えを要求します。エンジンは、`gScene→n`** 接続の **入力トランジション (フェード、スナップショット、またはタイルセット ワイプ) を再生し、新しいシーン (画像、衝突、カメラ、アクターとそのスクリプト) をロードして表示します。接続が定義されていない場合は、デフォルトのフェード (~1 秒) を使用します。 「n」が範囲外の場合は何も行いません。
- `switchScene(n, "name")` — 同じですが、**Name** フィールドが `"name"` である接続を選択します (同じ宛先に複数の接続がある場合に便利です)。名前が一致しない場合は、デフォルトのフェードが使用されます。 AdvanceCodeでも同じように書かれています。

### 接続の遷移World では、シーン間の各 **接続** には、*スナップショット*、*フェード*、または *ワイプ* (アニメーション化されたタイルセット + グラデーション) タイプの **入力** トランジション (目的のシーンに到着したときに表示されるトランジション) があります。エクスポートはそれを `runToBlack_CTi` / `runToScene_CTi` ペアにコンパイルし、 `switchScene` が `(source, destination)` によってそれを見つけます。
```c
switchScene(1);            // primera conexión gScene→1
switchScene(1, "puerta");  // la conexión llamada "puerta"
```
その下には、テーブル `gTransFrom/gTransTo/gTransName/gTransKind/gTransFrames/gTransCover/gTransReveal` と `findTransition(from, to, name)` があります。接続がカーテンとして構成されているが、有効なタイルセットがない場合、接続はフェードに降格され、エクスポート ログに報告されます。

### 近接性: `near(a, b, dist)`

`b` の **center** の周囲の `dist` px ボックスがアクター `a` に接触する場合、`1` を返します (`|centerX_a − centerX_b| ≤ dist`、Y でも同様)。キャラクターに付随して「話す」/「使用する」ことを目的としています。
```c
void script_update(void) {
  // pegado al jugador + pulsas A → cambio a la escena 1
  if (near(gSelf, &gActors[PLAYER_INDEX], 20) && (gJp & KEY_A)) {
    switchScene(1);
  }
}
```
「dist」は画面ピクセルです。 20 ≈ プレイヤーの体の半分。ゲームの規模に合わせて調整してください。

### キー側面: `gJp`

`REG_KEYINPUT` は、**今**キーが押されたかどうかを示します。 `gJp` (今押された) には **このフレームで押されたビットのみ** (立ち上がりエッジ) が含まれます。 「REG_KEYINPUT」と同じビット (0 = 押された)。以前の状態を手動で保存することは避けてください。「if (gJp & KEY_A)」は、キーを押したままにしても、押すごとに 1 回だけ実行されます。

> シーンの切り替え時にモーターがエッジをリセットし、切り替えの原因となったボタンが滑らないようにします。

### シーンが変わると何が変わるのか

- **画像、衝突、カメラ** はシーンごとです。`gColMap`/`gColCols`/`gColRows`/`gColTile` および `gCamX`/`gCamY` は読み込み時に更新されます (マルチシーンでは `CAM_X`/`CAM_Y` マクロではなくなりました。変数として使用します)。
- **アクター**: 各シーンは `gActors[0..count-1]` に **その**を設定します。 `ACTOR_COUNT` はすべてのシーンの最大値です。残りのスペースは 0 (`frameCount == 0`) に設定され、描画または衝突されません。
- **スクリプト**: アクターに割り当てられたスクリプトは、そのアクター (そのシーン インデックス) を指す `gSelf` で呼び出されます。別の現場から新しい俳優に台本を当てはめる＝瞬時に場面を変える。
- **プレイヤー**: `PLAYER_INDEX` は常に `0` であるため、各シーンで位置 0 のアクターがそのシーンの「プレイヤー」になります (スクリプトによって移動されます。アクターにコライダーがない場合、`updatePlayer` は何も行いません)。- **音楽**: 現時点では**開始シーン**の曲のみが再生されます。シーンごとの音楽は保留中です。
- 生成されたコードの `sceneData` は常に開始シーン (スプラッシュの後) です。他のものは `sceneData_1 … sceneData_{N-1}` になります (固定インデックスを持つ参照ではなく、生成された名前です)。

---

##10.16。最適化と黄金律

### 最も重要なこと: フレームの予算を超えないこと

- VBLANK の **~83,800 サイクル**。
- スプライト レンダリング: **~15 サイクル/不透明ピクセル** (前の四角形の差分によって削除 + 「スキップ」によって透明でペイント)。
- 緩やかな制限: ** カメラ内のスプライトの最大 5,600 ピクセル**。 21x31 (651px) アクターのコストは最大 10,000 サイクルです。このようなものが 3 つあり、約 30 K、まだ余裕があります。
- カメラ外ではコストは ~0 です (`drawActorRect` はクランプして戻ります)。

### CPU コスト ルール (ARM7TDMI)

|操作 |相対コスト |評議会 |
| :--- | :--- | :--- |
|和/積 `int` | 1 |あなたの毎日の糧 |
| `>>` / `<<` | 1 | 2 の累乗を使用して除算/乗算を行う |
| `%` (モジュール) |非常に高い | `%n` は避けてください。 `n` が 2 の累乗の場合、`& (n-1)` を使用します。
| `/` 除算 |非常に高い | 2 のべき乗以外の定数による除算は避けてください。
| `フロート` |壊滅的な |禁止 |
| EWRAMアクセス |遅い |大きなテーブルは `const` (ROM) に、バッファは EWRAM にあります。
| 76KB `memcpy` |遅い |エンジンはシーン全体のコピーを回避するようになりました。

例:
```c
// mal (cada frame):
// int idx = p->frame % 13;
// bien:
int idx = p->frame & 15;       // asumiendo frameCount = 16 o potencia de 2

// mal: vx /= 10;   → mejor:
vx -= vx / 8;                  // o vx >>= 3 si no necesitas precisión
```
### 推奨される独自の最適化

- 小さな `static inline` 関数を宣言します (関数を展開するように `-O2` コンパイラーに指示します)。
- テーブルを「const」にします。テーブルは ROM 内に存在し、EWRAM や IWRAM を汚しません。
- 内部ループ内の `volatile` ポインターではなく、ローカル バッファーを使用して `u16*` として VRAM にアクセスします (テンプレートはすでにこれを行っています)。
- 独自のグローバル変数を 50 個宣言するのではなく、アクターの空きフィールド (`vx`、`vy`、`timer`、`dir`) を再利用します。
- 独自のもの (ミニバー、事前計算されたテキスト) をペイントする場合は、同じ VBLANK 内で数ピクセルでペイントしてください。

### 実際のコンソールでは悪く見えるが、gbajs では悪く見えないケース

- 画面下部のティア/フリッカー → VBLANK オーバーライド。
- 半分の FPS でプレイしている → フレーム全体が必要以上に仕事をしています。
- 両方の解決策は、パッチではなく、フレームごとの作業 (表示されるアクター、独自のピクセル、軽量のスクリプト) を減らすことです。

---

##10.17。実際のコンソールとエミュレータでのデバッグ

|環境 |何を検出するのか |何が隠されているのか |
| :--- | :--- | :--- |
| **内蔵エミュレータ (gbajs)** |ロジック、衝突、遷移 |イントラフレーム タイミング (フレーム終了時の VRAM コピー) |
| **mGBA** | VBLANK タイミング、正確 | — (とても忠実です) |
| **フラッシュカート / 本物の GBA** |すべてが本物 | — |

### `printf` を使用しないデバッグ手法

1. **ボタンで一時停止:** ゲームをロックし、フレームごとに進めます。
```c
static u8 paused = 0;
static u16 kprev = 0;
void script_update(void) {
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  if ((keys & ~kprev) & (1 << 3)) paused = !paused; // START pausa
  kprev = keys;
  if (paused) return;
  // ... resto de la lógica
}
```
2
. **スプライト内の可視状態:** 状態 (安価な状態タグ) に従ってアクターのフレームを変更します。
3. **センチネルの点滅:** 画面上のピクセル (`screen[y*240+x]`) の色を切り替えて、ループをカウントしたり、通過しなかったパスを検出したりします。
4. **`gActors` のカウンター:** デバッグ値を `p->vx` に書き込み、フレームステップを使用してエミュレータ ロガーでそれを確認します。

### エクスポートコンソール

**EXPORT** または **PLAY** でコンパイルするときに、エディターの下部パネルにエクスポート警告 (`[WARN]`、`[OK]`) が表示されます。以下の点に注意してください。
- `script_update()` を使用しないスクリプト。
- `script_init/update` を複製します (シンボルの繰り返し)。
- アクター > 64 (切り捨てられます)。
- 長いトランジション (速度を調整することを忘れないでください)。

---

##10.18。クイックリファレンス (チートシート)

### テンプレートの定数とシンボル

|記号 |値 |注 |
| :--- | :--- | :--- |
| `SCREEN_W`、`SCREEN_H` | 240、160 |ピクセル |
| `ピクセル_カウント` | 38400 | 240×160 |
| `VRAM` | `0x06000000` | `スクリーン = (u16*)VRAM` |
| `ACTOR_COUNT` | 1-64 |エクスポートされたアクターによると |
| `PLAYER_INDEX` | 0 |俳優 0 |
| `歩く速度` / `走る速度` | 23 | px/vsync (肩 = 実行) |
| `アクセル` / `フリクション` | 1 / 1 |加速と制動 |
| `GRAVITY` / `MAX_FALL` | 1 / 5 | px/vsync² と端末速度 |
| `ジャンプ_ベル` / `ジャンプ_カット_ベル` | -11 / -3 |ジャンプブーストとカット |
| `コヨーテ_フレーム` / `ジャンプ_バッファ` | 5/5 |エッジ後ろのマージン / 着地前 |
| `MAX_ACTOR_FRAMES` | 32 |アクター別のフレーム || `CAM_X`、`CAM_Y` |デフォルトでは 0 |ワールド オフセット (単一シーン);マルチシーン `gCamX`/`gCamY` で |
| `gScene` / `gSceneTarget` | — |現在のシーン / 要求されたシーン (マルチシーン) |
| `gJP` | — |キーエッジ: このフレームで押されたビット数 |
| `gActorBack[]` | EWRAM |俳優の背景 | 写真
| `gActors[]` | — |グローバルリスト |

### レコード

|登録 |監督 |読む/使う |
| :--- | :--- | :--- |
| `REG_DISPCNT` | `0x04000000` | `MODE_3 \\| BG2_ENABLE` |
| `REG_VCOUNT` | `0x04000006` |現在の走査線 |
| `REG_KEYINPUT` | `0x04000130` |ボタン (0=押された) |
| `REG_SND1SWEEP/CNT/FREQ` | `0x60/62/64` |チャンネル1 |
| `REG_SND2CNT/FREQ` | `0x68/6C` |チャンネル2 |
| `REG_SND3CNT_L/H、FREQ` | `0x70/72/74` |チャンネル3波 |
| `REG_SND4CNT/FREQ` | `0x78/7C` |チャンネル 4 のノイズ |
| `REG_SNDCTL/CNTH/CNTX/BIAS` | `0x80/82/84/88` |マスター |

### `REG_KEYINPUT` ビットマップ
```
bit 0 A · bit 1 B · bit 2 SELECT · bit 3 START
bit 4 RIGHT · bit 5 LEFT · bit 6 UP · bit 7 DOWN
bit 8 R · bit 9 L   —  bit = 0 → PULSADO
```

```c
u16 keys = ~REG_KEYINPUT & 0x3FF;          // con 1 = pulsado
u16 jp   = keys & ~prevKeys; prevKeys = keys; // flanco
```
### 便利な機能

|機能 |結果 |
| :--- | :--- |
| `waitVSync()` | VBLANK を待ちます |
| `actorBox(a,&bx,&by,&bw,&bh)` |世界座標のコライダー |
| `rectHitsSolid(bx,by,bw,bh,dx,dy)` |タイルと衝突しませんか？ |
| `moveActorCollide(a,dx,dy)` |衝突しながら、軸ごとに移動します。
| `gSelf->animSpeed` |アニメーション ステップ/vsync (2 = double、[10.8](#108-actor-system-game-entities) を参照) |
| `movePlayer(keys,p)` |プレイヤーの十字キー |
| `updatePlayer()` |入力 + プッシュ アクター-アクター |
| `showDialogue(id)` |行 0 からダイアログ `id` を表示 ([10.13.1](#10131-dialogs-and-langages) を参照) |
| `showDialogueRow(key)` |コードまたは ID によって行にジャンプします。
| `nextDialogueRow()` |次の行に進みます |
| `dialogueUpdate()` | A を押したときのみ進みます (各フレームを呼び出します) |
| `aeSaveHasGame()` |有効な保存されたゲームはありますか? |
| `aeSaveWrite(データ, サイズ)` | SRAM に保存 (0 はOK、適合しない場合は -1) |
| `aeSaveRead(データ, サイズ)` | SRAM ロード (0 正常、-1 開始なし) |
| `aeSaveClear()` |ゲームを削除する |
| `hideDialogue()` |ダイアログを非表示にする |
| `gLang = n` |言語を選択します (0 = 最初の列、1 = 2 番目…) |
| `initActors()` / `advanceAllActors()` |自動アニメーション |
| `drawAllActors(画面)` | Z ソート + 描画 |
| `near(a,b,dist)` |中心間の±`dist` ピクセル? (近接) |
| `switchScene(n[, "name"])` |接続トランジションでシーンを切り替える（マルチシーン） |
| `noteOn(ch,&inst,ピリオド)` |ノートを撮る/SFX |

### 数式

|式 |使い方 || :--- | :--- |
| `RGB555(r,g,b) = ((r>>3)|((g>>3)<<5)|((b>>3)<<10)) & 0x7FFF` |ピクセルカラー |
| `周期 = ラウンド(2048 − 131072/周波数)` |ノート→時代記録 |
| `6.7 MHz → 280,896 サイクル/フレーム → 59.73 fps` |基本タイミング |
| `カメラ内のスプライト ピクセル ≤ ~5,600` | VBLANKの予算 |

---

##10.19。用語集

- **AABB** — 車軸が整列したボックス。アクターの衝突四角形。
- **APU** — オーディオ処理ユニット (GBA のサウンド部分)。
- **BG2_ENABLE** — MODE 3 ビットマップをアクティブにするビット。
- **EWRAM** — 外部ワーク RAM、256 KB、遅い。
- **IWRAM** — 内部ワーク RAM、32 KB、高速 (スタック)。
- **Key-on** — チャンネルノートを「オン」にするビット (`REG_*FREQ` の、`noteOn` を書き込む値のビット 14)。
- **モード 3** — RGB555 ピクセルの 240×160 ビットマップ モード。
- **OAM** — 属性メモリ オブジェクト: ハードウェア スプライト テーブル (エンジンでは使用されません)。
- **PPU** — ピクセル ペイント ユニット。
- **RGB555** — 15 ビットのスポット カラー (チャンネルごとに 5 ビット)。
- **走査線 / VCOUNT** — 現在の LCD 水平ライン。 `REG_VCOUNT` がそれを読み取ります。
- **VBLANK** — 垂直ブランキング期間 (68 ライン): 安全にペイントできる時間です。
- **Vsync** — 「垂直同期」: `waitVSync()` を待ちます。 1フレーム。
- **z-sort** — 俳優を「z」で並べ替えて、誰が誰をカバーするかを決定します。
- **Wave RAM** — チャンネル 3 からの 16 個の 4 ビット サンプルのバンク。
- **Thumb / ARM** — ARM7TDMI の 2 つの命令セット。

---

**前:** [09 — エクスポートとテスト](09-exportar.md) · **[インデックス](README.md)に戻る**