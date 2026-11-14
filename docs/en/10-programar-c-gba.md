#10 — Programming in C for the Game Boy Advance

> **Note:** This translation may contain errors, as the original documentation was written in Spanish.

> **Note:** This translation may contain errors, as the original documentation was written in Spanish.

> **Note:** This translation may contain errors, as the original documentation was written in Spanish.

> **Applies to:** the **Direct C** code you write in the module However, *verbatim* is inserted into the `main.c` that AdvanceEngine generates before the `main()`. Everything explained here is valid for that code, and at the same time it is a complete reference of the hardware and the template that the engine produces.
>
> **Prerequisite:** have **devkitARM** installed (see [00 — Getting started](00-inicio.md)). The pipeline generates `main.c` + `Makefile` and compiles with `arm-none-eabi-gcc` + `libgba`.

---

##Index

1. [GBA Hardware Basics](#101-gba-hardware-basics)
2. [Memory Map](#102-memory-map)
3. [Input/Output (I/O) Registers](#103-io-input-output-registers)
4. [Video: the reason why the engine uses MODE 3](#104-video-the-reason-why-the-engine-uses-mode-3)
5. [Time, scanlines and VBLANK (the sacred budget)](#105-time-scanlines-and-vblank-the-sacred-budget)
6. [Structure of the generated `main.c`](#106-structure-of-the-generated-mainc)
7. [Types and conventions of generated code](#107-types-and-conventions-of-generated-code)
8. [System of actors (the entities of the game)](#108-system-of-actors-the-entities-of-the-game)
9. [Input: read the buttons](#109-input-read-the-buttons)10. [Movement and collisions](#1010-movement-and-collisions) — includes the `movePlatformer` / `moveTopDown` primitives11. [Sound: the GBA APU](#1011-sound-the-gba-apu)12. [Frames, vsyncs and animation](#1012-frames-vsyncs-and-animation)
13. [The Direct C of your scripts: contract and API](#1013-the-direct-c-of-your-scripts-contract-and-api)
14. [Examples of ready-to-copy scripts](#1014-examples-of-ready-to-copy scripts)
15. [Various scenes in the ROM: `switchScene`, `near` and `gJp`](#1015-various-scenes-in-the-rom-switchscene-near-y-gjp)
16. [Optimization and golden rules](#1016-optimization-and-golden-rules)
17. [Debugging in the real console vs. emulators](#1017-debugging-in-the-real-console-vs-emulators)
18. [Quick Reference (cheat-sheet)](#1018-quick-reference-cheat-sheet)
19. [Glossary](#1019-glossary)

---

## 10.1. GBA Hardware Basics

### The SoC and its CPU

The GBA is a portable console from Nintendo released in 2001. Its heart is an **ARM7TDMI**:

| Property | Value |
| :--- | :--- |
| Architecture | ARM7TDMI (32-bit RISC) |
| Instruction modes | **ARM** (32 bits, 4 bytes) and **THUMB** (16 bits, 2 bytes) |
| CPU clock | 16.78 MHz (same bus speed) |
| Frame Rate | ~59.73 fps (280,896 cycles per frame) |
| Typical performance | ~16.8 MIPS (Thumb) / more with ARM |
| Review | numerous; most ROMs run on either |The CPU also has a small repertoire: registers R0-R15, CPSR/SPSR. There is no FPU: **you have to avoid all floating points** (see [16](#1016-optimization-and-golden-rules)).

The board is conceptually divided into:- **CPU (ARM7TDMI)**- **Video PPU** (modes 0-5, not hardware sprite in MODE 3)
- **Sound APU** (4 channels: 2 pulse, 1 wave, 1 noise)
- **BIOS** (blocks some services; cannot be modified)

For us (software rendering) the CPU **draws each pixel itself**, writing directly to VRAM. Hence the *VBLANK budget* (section 5) is born.

---

## 10.2. memory map

The GBA exposes 32 MB of addresses. The regions that matter to us:

| Region | Range | Size | Typical use | Speed ​​|
| :--- | :--- | :--- | :--- | :--- |
| **BIOS** | `0x00000000` | 16KB | System Systems (do not copy/read) | 1 cycle |
| **EWRAM** | `0x02000000` | 256KB | Big data, buffers, your `gActorBack` | 2 est. (slow) |
| **IWRAM** | `0x03000000` | 32KB | Stack, hot variables | 1 cycle (fast) |
| **I/O** | `0x04000000` | 1KB | Video, sound, input records | — |
| **Palette** | `0x05000000` | 1KB | Palette 256×2 (not used in direct MODE 3) | — |
| **VRAM** | `0x06000000` | 96KB | Framebuffer / tiles / sprites | 1 est. |
| **OAM** | `0x07000000` | 1KB | Hardware sprites (not used by the engine) | — |
| **ROM (PAK)** | `0x08000000` | ≤ 32MB | Code + constant data | 2-4 est. |**Key readings:**1. **VRAM in MODE 3** is 96 KB: the 240×160×2 byte framebuffer occupies 76,800 B (75 KB). The corner pixel `(x, y)` lives at `((u16*)0x06000000)[y*240 + x]`. The template does it with `u16* screen = (u16*)VRAM;` and `screen[pos]`.2. **EWRAM is slow** (2 wait states). The engine puts `gActorBack` there because 240×160 does not fit comfortably and it is only read per pixel during rendering.
3. **IWRAM is the fastest** for variables; the `-O2` compiler already places the stack there via `gba.specs`. Don't declare huge local arrays: the stack is small.
4. **ROM is read-only** and the `static const` data remains there. Convenient for large tables (sprite frames, period table, scenes).

> In an AdvanceEngine project, all of the above is already well distributed throughout the template. When *you* write Direct C try to respect this hierarchy: tables in `const` (ROM), large `static` buffers (EWRAM), local work variables (IWRAM).

---

## 10.3. Input/output (I/O) registers

Registers are addressed as pointers with `volatile`. libgba's `#include &lt;gba.h&gt;` already defines most of them; The template defines the ones it needs for security with its own macros:

| Registration | Address | Access | What is it |
| :--- | :--- | :--- | :--- |
| `REG_DISPCNT` | `0x04000000` | RW | Screen control (mode + layers) |
| `REG_VCOUNT` | `0x04000006` | R | Current Scanline (0-227) || `REG_KEYINPUT` | `0x04000130` | R | Button status (**0 = pressed**) || `REG_SND1SWEEP` | `0x04000060` | RW | Channel 1: frequency sweep |
| `REG_SND1CNT` | `0x04000062` | RW | Channel 1: duty + surround |
| `REG_SND1FREQ` | `0x04000064` | RW | Channel 1: period + key on || `REG_SND2CNT` | `0x04000068` | RW | Channel 2: duty + surround |
| `REG_SND2FREQ` | `0x0400006C` | RW | Channel 2: period + key on |
| `REG_SND3CNT_L` | `0x04000070` | RW | Channel 3 (wave): control |
| `REG_SND3CNT_H` | `0x04000072` | RW | Channel 3 (wave): high control |
| `REG_SND3FREQ` | `0x04000074` | RW | Channel 3 (wave): period + key on |
| `REG_SND4CNT` | `0x04000078` | RW | Channel 4 (noise): surround |
| `REG_SND4FREQ` | `0x0400007C` | RW | Channel 4 (noise): ratio + key on |
| `REG_SNDCTL` | `0x04000080` | RW | General control (volumes, enable) |
| `REG_SNDCNTH` | `0x04000082` | RW | Enable/channel attention |
| `REG_SNDCNTX` | `0x04000084` | RW | Channel volume |
| `REG_SNDBIAS` | `0x04000088` | RW | PWM Bias (DAC Bias) |
| Wave RAM | `0x04000090` | RW | 16 4-bit samples of channel 3 |

The template generates these useful definitions in almost every main.c:
```c
#define REG_SND1SWEEP *(vu16*)(0x04000060)
#define REG_SND2CNT   *(vu16*)(0x04000068)
// ... y así con todos los de sonido
```
**Golden rule of registries:** always access through `volatile` pointers. Libgba calls them `REG_*/IO_*`; the template uses `REG_DISPCNT`, `REG_VCOUNT`, `REG_KEYINPUT`.

---

## 10.4. Video: the reason why the engine uses MODE 3

The GBA has 6 video modes:

| Mode | Type | Screen |
| :--- | :--- | :--- |
| 0 | Tiles 4 BG, all per character | 4 plans |
| 1 | Tiles + 1 rotation/scale | — |
| 2 | Rotation/scale tiles | 2 BG |
| **3** | **Bitmap 240×160, 16-bit per pixel** | **1 framebuffer** |
| 4 | Bitmap 240×160, 8-bit + palette | 1-2 framebuffers |
| 5 | Bitmap 160×128, 16-bit | 1-2 framebuffers |

**AdvanceEngine uses MODE 3**: the simplest for software rendering. `main()` does:
```c
REG_DISPCNT = MODE_3 | BG2_ENABLE;
u16* screen = (u16*)VRAM;
```
-
 Each pixel is a `u16` (2 bytes) in **RGB555 format**.
- BG2_ENABLE (bit 10 = 0x400) activates the plane on which it is drawn.
- There are no hardware sprites in bitmap mode: **the engine actors are drawn by the CPU** (see section 8).

### RGB555 pixel format
```
15 14 13 12 11 10 9 8 7 6 5 4 3 2 1 0
 x  B  B  B  B  B G G G G G R R R R R
    x  ·          bits del color         ·
```
-
 Red (5 bits), green (5), blue (5) = **32 levels per channel** → 32,768 possible colors.
- Bit 15 is not used in MODE 3 (the template reserves it for internal sprite markers: **bit15 = 1 means transparent pixel** in the actors' frames).

To convert a CSS/RGB color (0-255) to the GBA value use the same formula as the engine:
```c
#define RGB555(r, g, b) ((((r) >> 3) | (((g) >> 3) << 5) | (((b) >> 3) << 10)) & 0x7FFF)
```
Example
: `RGB555(255, 0, 0)` → `0x7C00` (pure red), `RGB555(0,0,255)` → `0x001F` (pure blue), white → `0x7FFF`.

### Write a pixel / fill the screen
```c
// Un píxel
screen[y * 240 + x] = RGB555(255, 255, 255);

// Barrer toda la pantalla (patrón que usa el motor para fondos)
for (i = 0; i < PIXEL_COUNT; i++) screen[i] = color;
// con PIXEL_COUNT = 240*160 = 38400
```
> **Don't write VRAM outside of VBLANK** if you can avoid it: you will see tearing. The engine draws the scene inside `waitVSync()`. Scripts that display your own text should do the same.

---

## 10.5. Time, scanlines and VBLANK (the sacred budget)

### Current console timing

- The LCD draws **228 lines per frame**: 160 visible + 68 blanking.
- Each line lasts **1232 CPU cycles**.
- Total frame = 228 × 1232 = **280,896 cycles** → **59.73 fps**.
- The interval where the screen does not scan (VBLANK) = 68 × 1232 = **~83,800 cycles**.
```c
static void waitVSync(void) {
  while (REG_VCOUNT >= SCREEN_H);   // esperar a que deje la zona visible
  while (REG_VCOUNT < SCREEN_H);    // y que entre en la zona de blanking
}
```
The
 template calls `waitVSync()` on each turn of the game loop. Between one `waitVSync()` and the next **you can do ~83,800 work cycles without losing the frame**.

### The budget rule

If your frame does more work than can fit in VBLANK:

1. The next frame is eaten; the game loop **drops to ~30 fps** (or worse).
2. Animations (delayed in vsyncs) slow down.
3. On the real console you will see *flickers* in the lower area where the LCD has already captured the rect of the last actor.

The engine is optimized so that this does not happen (see [16](#1016-optimization-and-golden-rules)):

- Actor rendering costs **~15 cycles per opaque pixel** (drawn and erased in a single pass).
- Rule of thumb: **~5,600 px of in-camera sprite per frame** fits loosely.
- Off-camera actors barely cost (rect clamp → 0 work per pixel).

**Your scripts must be lightweight:** a few dozen operations per actor per frame are irrelevant; Nested loops of thousands of iterations within the VBLANK will break the rhythm.

---

## 10.6. Structure of the generated `main.c`

An AdvanceEngine `main.c` follows this order (partial depending on the project):
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
### `main()` seen inside
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
### Scene functions (they will be visible to you from your scripts)
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
> You don't write `main()`. Your code is inserted **one level below**: a valid file that only exists because of its `script_init`/`script_update` functions (see [13](#1013-the-direct-c-of-your-scripts-contract-and-api)).

---

## 10.7. Types and conventions of generated code

libgba defines the types used by the template (`#include &lt;gba.h&gt;`):

| Type | Width | Volatile | Sign | For what |
| :--- | :--- | :--- | :--- | :--- |
| `s8` `/` `s16` `/` `s32` | 8/16/32 | yes | with sign | mathematics |
| `u8` `/` `u16` `/` `u32` | 8/16/32 | not | without | data, colors, addresses |
| `vu8` `/` `vu16` `/` `vu32` | 8/16/32 | **yes** | without | hardware logs |
| `int` | 32 | not | with | loops and default arithmetic |

Template conventions that you should respect in your scripts:

- **Everything is 32 bits by default.** Don't use `long` like crazy: `int` costs the same and is simpler.
- Registration colors and values ​​are `u16`.
- Actor positions are `s16` (range ±32767; outside of that you'll wonder why they break).
- The template's static functions can be called from your scripts because they are defined **above** the scripts section (same file, same scope). You don't need prototypes.
- `static` symbols inside your scripts (auxiliary variables) are perfect because your block lives at the file level.

### Section attributes that you will see in the code
```c
static u16 gActorBack[240*160] __attribute__((section(".ewram"), aligned(4)));
```
-
 `section(".ewram")` → places the buffer in EWRAM (256 KB) instead of in the BSS. 240×160×2 = 76,800 B does not fit in stack-rooted IWRAM.
- `aligned(4)` → efficient mid-word access.

Tip: for your own large buffer (e.g. a mini-text buffer), apply the same attribute; If you declare it local, your stack explodes (32 KB).

---

## 10.8. Actor system (the game entities)

### The `GBAActor` struct
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
`GBAFrame` is:
```c
typedef struct {
  const u16* img;  // píxeles RGB555; bit15=1 => transparente
  u16 w, h;
} GBAFrame;
```
### The global list
```c
#define ACTOR_COUNT  <n>        // 1..64
#define PLAYER_INDEX 0          // el actor 0 es "el jugador"
#define MAX_ACTOR_FRAMES 32
#define CAM_X 0                 // offset de cámara (si lo configuraste)
#define CAM_Y 0

static GBAActor gActors[ACTOR_COUNT];
```
### Life cycle of an actor

1. **`initActors()`** (inside `sceneInit`): positions actors, hooks `frames[]` and `delays[]` to images in the pool, sets `mode`, `hasCollider`, `cw/ch`.
2. **`advanceAllActors()`** (every frame): if `frameCount > 1`, increment `timer`; when `timer >= delays[frame]` advances the `frame` according to the `mode`:
   - `mode 0` (*once*): goes up to `frameCount-1` and stays.
   - `mode 1` (*loop*): `(frame+1) % frameCount`.
   - `mode 2` (*pingpong*): goes up/down alternating according to `dir`.
3. **`updatePlayer()`** (every frame, only if `gActors[PLAYER_INDEX].hasCollider == 1`): moves the player with collisions **unless the player has a script assigned** (in which case it is moved by your `script_update`) and pushes other actors. (see sections 9, 10 and 10.14).
4. **`drawAllActors(screen)`** (each frame): sort by `z` and draw `drawActorRect` one by one.

### The animation cadence and `animSpeed`

`advanceAllActors()` advances the `timer` of each actor and moves to the next `frame` when `timer >= delays[frame]`. That is to say:- **Base speed**: `delays[frame]` vsyncs per frame (the exporter calculates it in the editor from the duration of each frame of the sprite). With delays of 6 vsyncs → 10 fps animation.- **`animSpeed`** (actor field, `0/1` = normal): Every vsync the `timer` advances `animSpeed` ticks instead of 1. It is written by your script and only affects the actor that touches it. - **There is no automatic acceleration**: the motor does NOT increase the speed of anyone for moving (neither the walker nor the NPCs). Any speed other than the exact cadence comes out of your code.

#### Accelerate your stride only when walking

The typical use is for the animation of the walker to accompany the movement. In `script_update` raise `animSpeed` while moving with `gSelf` and return it to `1` when releasing:
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
It
 only changes the animation of the actor whose `animSpeed` you tap; the rest of the scene continues with its exact cadence even though the world moves.

### To-code example: read player actor
```c
void script_update(void) {
  GBAActor* p = &gActors[PLAYER_INDEX];
  p->x += 1;            // mueves 1 px por frame (60 px/s)
}
```
**Actors API Tips from Scripts:**

- Each round of `script_update` runs **after** `advanceAllActors`/`updatePlayer` and **before** `drawAllActors`. That is to say: you read the animated state and your changes are painted in that same frame.
- To "jump" to a specific frame of the animation: `a->frame = k; a->timer = 0;`
- To use another animation (another set of frames) you would need to remap `a->frames[i]`; in the current version of export the set is set to `initActors`. You can change `a->frame` and `a->mode`, or share frames between actors (the pool deduplicates images).
- `z` controls who covers who. Change it at will (even every frame) for "depth class" effects.
- `vx`/`vy` are **free** fields: use them for your own physics (gravity, obstacles, NPCs).

---

## 10.9. Input: read buttons

### The truth about `REG_KEYINPUT`

`REG_KEYINPUT` is a read-only 16-bit register at `0x04000130`.

**Bit = 0 means button PRESSED** (active due to low level). Bit = 1 means loose.

| Bit | Button | Bit | Button |
| :--- | :--- | :--- | :--- |
| 0 | **A** | 5 | **←** (LEFT) |
| 1 | **B** | 6 | **↑** (UP) |
| 2 | **SELECT** | 7 | **↓** (DOWN) |
| 3 | **START** | 8 | **R** |
| 4 | **→** (RIGHT) | 9 | **L** |Bits 10-15 are unwired (you ignore them, don't read them).> ⚠️ It is the **real GBA map** (`b0=A, b1=B, b2=SELECT, b3=START, b4=RIGHT, b5=LEFT, b6=UP, b7=DOWN, b8=R, b9=L`). Don't confuse it: the reverse context will give you a player who walks backwards. It will be a very common bug.### The standard pattern for "button pressed"
```c
u16 keys = ~REG_KEYINPUT & 0x3FF;   // invertir bits + enmascarar a los 10 botones
if (keys & (1 << 0)) { /* A pulsado */ }
if (keys & (1 << 4)) { /* derecha */ }
```
The
 template has the buttons already masked with constants, so as not to count shifts by hand:
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
And
 `movePlayer()` moves the player with [`moveTopDown`](#move-primitives-ready-to-use):

### Detect "just pressed" (edges: edge/rising)

The D-pad "hold" moves each frame. To jump or shoot only **in the frame in which it is pressed** save the previous state:
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
### Simultaneous and priority controls

- `justPressed` is a set of bits: you can require **combinations**:
```c
if ((justPressed & (1 << 0)) && (justPressed & (1 << 1))) { /* A+B */ }
```
-
 You decide the priority in the code: `if / else if` is more predictable than several independent checks that cause "spikes".

---

## 10.10. Movement and collisions

### Coordinates and camera

In the world of the template, each actor saves its position **on screen** (`x, y`), because the engine is designed for a fixed 240×160 screen. `CAM_X/CAM_Y` add a world offset to the collision:
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
 If in the World inspector the actor has **collider**, the template fills `cw/ch` with its size (or that of the sprite if not). The collider is **centered** on the sprite.

### The collision map and its tile types

If your scene has a collision map (edited in the World Module), the template emits:
```c
#define COLLISION_COLS ...
#define COLLISION_ROWS ...
#define COLLISION_TILE_SIZE 8   // tamaño de tile, en px
#define CAM_X ...
#define CAM_Y ...
const u8 collisionMap[ROWS][COLS] = { ... };
```
**Tile values on the map** (according to `solidTile`):

| Value | Type | Blocks |
| :--- | :--- | :--- |
| `0` | Empty | nothing |
| `1` | Solid | always |
| `2` | One-way ↑ | only when **falling** (Ydir > 0) |
| `3` | One-way ↓ | only when **up** (dirY < 0) |
| `4` | One-way ← | only going **right** (Xdir > 0) |
| `5` | One-way → | only going **left** (Xdir < 0) |
| `6` | Staircase | passable (does not block) |
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
### `rectHitsSolid` and `moveActorCollide
```
`c
// ¿El rectángulo de mundo (bx,by,bw,bh) toca algún tile sólido PARA la
// dirección (dx,dy)?
static inline int rectHitsSolid(s16 bx, s16 by, s16 bw, s16 bh, s16 dx, s16 dy);

// Mueve un actor resolviendo eje por eje (X e Y por separado):
// se mueve, comprueba, y si choca, revierte.
static void moveActorCollide(GBAActor* a, s16 dx, s16 dy);
```
`moveActorCollide` is the best tool: it allows you to slide on walls (it doesn't get stuck on diagonals). Use it with **small displacements** (2-4 px per frame).

### Actor-actor push
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
That
 is to say: the player **pushes** the others (if they both have a collider). So that an NPC doesn't do it, let him have `hasCollider = 0` (or only he doesn't collide). If you want *everyone* to push each other, replicate that loop in your script.

### Manual physics with integers (gravity without float)

Example of "simple gravity" physics for an NPC, using `vx/vy` and a collider:
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
> Since the positions are integral, the "1 px per frame squared" gravity works fine at 60 fps. Don't claim to duplicate with `/=2` if it's not a power of 2 (see [16](#1016-optimization-and-golden-rules)).

### Movement primitives (out of the box)

Writing the physics by hand for each game is repetitive, so the template comes with **two already solved primitives** that you just have to call. They are not prefabricated "bases" or "levels": the level is already your tile map, and the only thing that changes between a platformer and a topdown maze is what primitive you call.

**Everything is wrapped with `#define`s**, so the behavior is changed on one site and affects all your scripts:
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
#### `movePlatformer(actor, keys)` — platforms
```c
static void movePlatformer(GBAActor* a, u16 keys);
```
Gravity
 + jump "from Orphan Knife", with the three aids that make a jump feel good:

- **Coyote time**: If you just left a platform, you can still jump during `COYOTE_FRAMES`. Press A mid-frame after leaving the edge and the jump counts.
- **Jump buffer**: If you press A until `JUMP_BUFFER` vsyncs *before* touching the ground, the jump is saved and triggered upon landing. Avoid the "I pressed late and it didn't jump."
- **Variable jump**: releasing A while climbing cuts the speed to `JUMP_CUT_VEL`. Hold down = high jump; one touch = short jump.
- **one-way** tiles only block if you are falling, so you can go up through them.

Your full platform script is literally this:
```c
void script_update(void) {
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  movePlatformer(gSelf, keys);
}
```
#### `moveTopDown(actor, keys)` — maze / RPG / menus
```c
static void moveTopDown(GBAActor* a, u16 keys);
```
Four
 directions with acceleration and braking, **without gravity**. Run with `R`/`L`:
```c
void script_update(void) {
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  moveTopDown(gSelf, keys);
}
```
If
 the actor hits a tile, that speed is set to 0 (so as not to get "stuck" to the wall with the maximum loaded speed).

#### `onFloor(actor)` — is it on the floor?
```c
static int onFloor(GBAActor* a);
```
Look
 at a tile below the collider. Useful for your own decisions (patrols, enemies that only move on the ground, "in the air" animations):
```c
void script_update(void) {
  GBAActor* e = &gActors[1];
  if (onFloor(e) && (REG_KEYINPUT & 0x200) == 0) {
    // solo patrulla si toca suelo
  }
}
```
> **Nothing forces you to use them.** If a primitive doesn't fit your game, ignore it and move `gSelf` by hand with `moveActorCollide` — the previous section. They are there to save you 90% of physics, not to impose a gender on you.


### Teleportation and limits
```c
p->x = 100; p->y = 80;      // la posición se aplica ANTES del draw del frame
// si reciclás a fuera de pantalla, recuerda drawActorRect hace clamp y lo ignora
// (baja coste), pero volverá visible al read-regresar.
```
--
-

## 10.11. Sound: the GBA APU

### The APU in summary

4 effective synthesis channels (plus a DMA of PCM samples that the engine does not use):

| Channel | Name | Synthesis |
| :--- | :--- | :--- |
| 1 | **Press 1** | square wave + frequency sweep (sweep) |
| 2 | **Press 2** | square wave (no sweep) |
| 3 | **Wave** | 16 4-bit samples (wave RAM) |
| 4 | **Noise** | pseudorandom noise |

### `noteOn()`: the function that plays a note

The template generates (for the project's sound editor) a function `noteOn(int ch, const GBAInst* inst, u16 period)` and a period table:
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
`noteOn` applies:
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
### Duty cycles (square wave)

The `duty` field (0-3) controls the high/low ratio of the waveform:

| duty | Wave | Loudness |
| :--- | :--- | :--- |
| 0 | 12.5% ​​| fine flute, "tu-tu" |
| 1 | 25% | more nasal timbre |
| 2 | 50% | classic square wave (tunes) |
| 3 | 75% | ringtone similar to 25% invested |

### Play an SFX from a script

Practical strategy: **steal a channel** as long as it doesn't play background music, or add your own sound if the project doesn't have a song. A shocking mini-SFX for channel 2:
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
> If the project has background music, channels 1-4 will be occupied by the sequencer. For your own SFX without crashing, you could lower a channel of the song at that moment or **reuse channel 4 (noise)** for percussion/beats, which is the least intrusive. Dedicated SFX are planned in future versions.

### Channel 3 Wave RAM
```c
static void initWaveRAM(void) {
  vu16* wave = (vu16*)0x04000090;
  const u16 waveData[8] = { 0x0123,0x4567,0x89AB,0xCDEF, 0x0123,0x4567,0x89AB,0xCDEF };
  int i;
  for (i=0;i<8;i++) wave[i] = waveData[i];
}
```
16
 4-bit samples, the template loads them in `initSound()`. By defining your own waveform here you can create different timbres for channel 3 (e.g. a triangle wave or a soft square).

### Typical `initSound()` values
```c
REG_SNDBIAS = 0x200;      // sesgo correcto del DAC (136' ciclo)
REG_SNDCNTX = 0x0080;     // volumen del sonido al 100% (canal master)
REG_SNDCNTH = 0x0002;
REG_SNDCTL  = 0xFF77;     // Master: full, y enable de los 4 canales
REG_SND3CNT_L = 0x0080;   // wave al 100%, sin output tweak
REG_SND3CNT_H = 0x0001;
initWaveRAM();
```
### Songs and the time loop

If the project has music, the template generates `SONG_BPM...`, `SONG_STEPS...`, the song constants and:
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
With
 BPM=900 one step matches one frame (60 steps/s). Change the accumulator if you want a different tempo, not the threshold.

---

## 10.12. Frames, vsyncs and animation

The entire engine timing system is based on **vsyncs = frames**:

- `waitVSync()` is called once per loop loop → **1 frame = 1/60 s**.
- `delays[i]` saves how many vsyncs each frame of the animation lasts. In the inspector, the engine **converts** milliseconds → vsyncs (`round(ms*60/1000)`).
- For your own animation from script, do something equivalent: a frame counter and change `a->frame` when it touches.
```c
// Parpadeo cada 30 frames (0,5 s)
static u16 blink = 0;
void script_update(void) {
  GBAActor* a = &gActors[1];
  if (++blink < 30) a->frame = 0;
  else if (blink < 60) { a->frame = 1; if (blink >= 60) blink = 0; }
}
```
**Rule of thumb:** never put delays in milliseconds by hand; count vsyncs (`u16 timer`). A blocking "delay(500)" leaves the game frozen because **there is no other thread**: your script and the renderer share the same frame.

---

## 10.13. The Direct C of your scripts: contract and API

### How to insert your code

When you export with a **Direct C** mode script whose `cCode` field is not empty, `gba_export.ts`:

1. Place your **verbatim** code (as is, `\n` `\n`) inside the `main.c`, in the section `// ── User Scripts (Direct C) ──` **before** `int main()`.
2. Generate two dispatchers:
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
. Call `userScriptsInit()` inside `sceneInit()` (after `initActors()+drawAllActors`) and `userScriptsUpdate()` **at every turn** of the game loop (with actors, with music, and if there are no actors, too!). That's why your `script_update` always runs at 60 fps.

### The exact contract
```c
void script_init(void) {
  //  1 vez, al entrar en la escena (después de que los actores estén colocados).
}
void script_update(void) {
  //  cada frame del juego, justo antes del drawAllActors.
}
```
-
 **Both are optional.** If you don't define `script_update`, your script is just setup. If you do not define any, the export already warns you with a warning.
- **There must be EXACTLY 1 definition** of each one. If there are several (or several scripts with the same function), the engine does not call any of them and a warning indicates this in the export console. With `cCode` like this, the compiler will give duplicate symbol if you define duplicate.
- So that the contract is well understood: **do not write `void script_update(void)` inside blocks or with parameters**. It is the exact shape that the detector detects (with tolerable spaces).

### What is available within your scripts (full API)

Everything already defined above in the file (static if it is `static`) is accessible:

- `gActors[ACTOR_COUNT]`, `GBAActor`, `GBAFrame`, `PLAYER_INDEX`, `CAM_X/CAM_Y` (single-scene; in multi-scene they are `gCamX/gCamY`, see [10.15](#1015-various-scenes-in-rom-switchscene-near-y-gjp)), `MAX_ACTOR_FRAMES`.
- `moveActorCollide(a, dx, dy)`, `movePlayer(u16 keys, GBAActor* p)`, `updatePlayer()`, `actorBox()`, `rectsOverlap()`, `rectHitsSolid()` (if map), `solidTile()`, `advanceAllActors()`, `initActors()`.- **Move primitives:** `moveTopDown(a, keys)`, `movePlatformer(a, keys)`, `onFloor(a)`, `approach(&v, target, step)`.- **Multiple scenes:** `switchScene(n)`, `near(a, b, dist)`, `gJp`, `gScene` (see [10.15](#1015-multiple-scenes-in-the-rom-switchscene-near-y-gjp)). `KEY_DOWN`, `KEY_LEFT`, `KEY_RIGHT`, `KEY_SHOULDER`.
- `REG_KEYINPUT` (`0x04000130`), correct bitmap (see [9](#109-input-read-the-buttons)).
- **Dialogues:** `showDialogue(id)`, `nextDialogueRow()`, `hideDialogue()`, `gLang` (see [10.13.1](#10131-dialogues-and-languages)).
- **Menus:** `menuOpen(count)`, `menuClose()`, `menuSetItem(i, text)`, `menuSetBox(x,y,w,h)`, `menuSetFont(f)`, `menuSetBoxSprite(db)`, `menuSelected()`, `menuVisible()`, `menuUpdate()` (see [10.13.2](#10132-menus-markets-inventories-stores)).
- `SCREEN_W=240`, `SCREEN_H=160`, `PIXEL_COUNT=38400`, `screen` is **not** as a symbol: use `(u16*)VRAM` if you want to paint.
- `REG_SND1..4*`, `noteOn()`, `GBAInst`, `gNotePeriods` (if there is sound in the project).
- `waitVSync()`.
- You define conditionals: `ACTOR_COUNT`, `COLLISION_*` (if there is a map).

### 10.13.1. Dialogues and languages

If the project has dialogs, the engine exports these functions and the global variable:
```c
void showDialogue(int id);            // muestra el diálogo `id` desde la fila 0
void showDialogueRow(const char* key); // salta a una fila por su código o su ID
void nextDialogueRow(void);           // avanza a la siguiente fila (si está visible)
void hideDialogue(void);              // oculta el diálogo
void dialogueUpdate(void);            // avanza solo al pulsar A (llámala cada frame)
extern int gLang;                     // idioma activo: 0 = primera columna, 1 = segunda, …
```
-
 `id` is the **order of the dialog in the editor** (0, 1, 2...), not the ID of the row.
- `showDialogueRow(key)` finds the first row whose **Code field** or **Full ID** matches `key` and displays it. If it doesn't find anything, it doesn't do anything.
- The displayed text is `text[row][gLang]`. Change `gLang` before `showDialogue`/`showDialogueRow` to choose the language (the index follows the order of the Dialogue table columns).
- **Box by actor**: the box is drawn with the image, position and size that you configured in the actor (World → text actor → Dialog Box). If the actor does not have a box, one is used by default.
- **Font per row**: each row uses the font chosen in the "Font" column of the Dialog table.
- **Speaker**: The "Name" field of the row is drawn over the box.
- **Sound per row**: if the row has a sound assigned, it plays when displayed.
- `nextDialogueRow()` and `hideDialogue()` do nothing if the dialog is hidden.
```c
void script_update(void) {
  gLang = 1;                              // 0 = primer idioma, 1 = segundo
  if (gJp & 8) showDialogueRow("saludo"); // START: fila por código
  dialogueUpdate();                       // A: siguiente fila (auto)
  if (gJp & 2) hideDialogue();            // B: ocultar
}
```
You
 can also use the full ID of the row: `showDialogueRow("New dialog 3-002-1")`.

### 10.13.2. Menus (markets, inventories, stores)

A generic menu for scripts: the engine draws it **above the actors** every frame, with the dialog box you choose (or any box) and the font you put. Up to 8 items.
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
 The selection is moved by the engine (`menuUpdate` is called alone each frame); your script just reads `menuSelected()` and decides what to do with A/B.
- The menu **does not pause** the game: the actors continue animating. If you want to freeze the player, do not move it while the menu is open.
- The highlighted item is drawn with a `>` to the left.

Example (NPC selling 3 items):
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
### 10.13.3. Saved in SRAM

The engine includes a save system in the cartridge's SRAM (`0x0E000000`), with magic, version and checksum (FNV-1a) to detect corrupted games or another version.
```c
int  aeSaveHasGame(void);              // 1 si hay partida guardada válida
int  aeSaveWrite(const u8* data, u32 size); // 0 ok, -1 si no cabe (máx. 256 B)
int  aeSaveRead(u8* data, u32 size);   // 0 ok, -1 si no hay partida
void aeSaveClear(void);                // borra la partida
```
Example
:
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
 The block is **256 bytes** maximum (`AE_SAVE_MAX`); If you need more, change the `define` in `main.c`.
- SRAM persists between runs in the emulator (mGBA saves it in a `.sav`) and in flashcart.
- **Do not confuse** with the emulator's save-state (which is separate).
- If the checksum does not match (corrupt game or other version), `aeSaveHasGame()` returns 0 and is treated as "no game".

### Mandatory rules for your code

| Rule | Why |
| :--- | :--- |
| **Without `float`/`double`** | There is no FPU; the compiler simulates with very slow soft-float. |
| **Without `malloc`/`free`** | There is no memory manager; declare static. |
| **Without `printf` on screen** | There is no console. To debug, see [17](#1017-debugging). |
| **No blocking infinite loops** | They freeze the render. Use counters per vsync. |
| **Do not write VRAM outside of VBLANK** | Tearing on real console. |
| **Shortcode per frame** | VBLANK budget (~83.8K cycles). |
| **No file I/O** | It doesn't exist. There is no file system. |

---## 10.14. Examples of ready-to-copy scripts### 1. Move an actor with the D-pad (with and without collisions)**Player/actors:** a script ONLY runs if it is **assigned to an actor** (World → Inspector → Script). The engine calls the script **once for each assigned actor**, with the global variable `GBAActor* gSelf` pointing to the actor in question — use `gSelf` to move THAT actor (not `gActors[PLAYER_INDEX]`, which always moves the player). If the player **does not** have a script assigned, the engine moves him only with the D-pad using `moveTopDown` (2 px/frame, with tile collisions) — change `WALK_SPEED` if you want another speed. If the player **does** have a script assigned, it is moved by your `script_update` (and the engine does not interfere). Be careful: scripts from OTHER actors (NPC, enemies) do not take control away from the player.

> Shortcut: If you just want to move, don't write physics. `movePlatformer(gSelf, keys)` gives you full platforms and `moveTopDown(gSelf, keys)` a maze, both with collisions. See [10.10](#out-of-the-box-motion-primitives).

The example works for **any actor** (player or NPC) with a controller. **Important for the collision tiles to work:** if you move an actor `+= 2` bareback, it **ignores the collision map** (it does not detect it → it passes through or "slows down" due to the push of other actors). To collide with tiles use `moveActorCollide()`:
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
If
 your scene does **not** have a collision map (or you don't want to crash), the direct version:
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
> The actor collider in the inspector only intervenes in the **actor-actor** push (`updatePlayer`) and in `moveActorCollide` (uses the centered collider `cw/ch`). For a move to respective tiles, the call to `moveActorCollide` is mandatory.

### 2. Trigger SFX when pressing A (eleven)
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
### 3. Enemy that patrols and teleports when reaching the edge
```c
void script_update(void) {
  GBAActor* e = &gActors[1];
  e->x += 1;
  if (e->x > 230) e->x = -21;   // fuera de cámara por la izquierda
}
```
### 4. Change the animation of an actor (frame/mode)
```c
void script_update(void) {
  GBAActor* p = &gActors[PLAYER_INDEX];
  if (p->x % 20 < 10) { p->frame = 0; }
  else                 { p->frame = 1; }
  p->timer = 0;   // reinicia el contador para que no "salte" solo
}
```
### 5. Ice-physics: inertia with integer (without float)
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
### 6. Full platforms (gravity, jump, coyote and buffer)
```c
void script_update(void) {
  GBAActor* p = gSelf;
  u16 keys = ~REG_KEYINPUT & 0x3FF;
  movePlatformer(p, keys);   // todo el trabajo, una línea
}
```
Before
 primitives existed this was ~20 lines of `vy += GRAVITY`, saturate to `MAX_FALL`, detect ground by hand and watch `vy == 0` to jump. It is no longer necessary: ​​`movePlatformer` does it and also adds coyote time, jump buffer and variable jump. Adjust the behavior by touching the `#define` of [10.10](#movement-primitives-ready-to-use).

If your actor is an NPC with gravity but manual control (for example, a ball or a falling enemy), use `onFloor` to find out if it touched the ground:
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
> `onFloor` looks at one tile below the collider in the fall direction, so it respects one-way tiles just like the rest of the physics.

### 7. Frame counter and condition every N seconds
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

## 10.15. Various scenes in the ROM: `switchScene`, `near` and `gJp`

The export **embeds ALL the project scenes** in the ROM. The starting scene is the one that the splash has defined as follows; changing scenes mid-game is a script call.

### How scenes are numbered

The scene index is the **order in the editor** (the list of World scenes, from top to bottom): scene 0 is first, scene `N-1` is last (N = total). It doesn't depend on the name. Editor **connections** are exported: they define the transition that plays when changing scenes (see below).

- `gScene` — index of the current scene (read).
- `switchScene(n)` — requests to switch to scene `n`. The engine plays the **input transition of the `gScene→n`** connection (fade, snapshot or tileset wipe), loads the new scene (image, collision, camera, actors and their scripts) and reveals it. If there is no connection defined, use the default fade (~1 s). If `n` is out of range it does nothing.- `switchScene(n, "name")` — same, but choose the connection whose **Name** field is `"name"` (useful if there are multiple connections to the same destination). If the name does not match any, the default fade is used. In AdvanceCode it is written the same.### Connection transitionIn World, each **connection** between scenes has an **Input** transition (the one seen when arriving at the destination scene) of type *snapshot*, *fade* or *wipe* (animated tileset + gradient). The export compiles it to a `runToBlack_CTi` / `runToScene_CTi` pair and `switchScene` locates it by `(source, destination)`:
```c
switchScene(1);            // primera conexión gScene→1
switchScene(1, "puerta");  // la conexión llamada "puerta"
```
Below
 that is a table `gTransFrom/gTransTo/gTransName/gTransKind/gTransFrames/gTransCover/gTransReveal` and `findTransition(from, to, name)`. If a connection was configured as a curtain but does not have a valid tileset, it is demoted to fade and is reported in the export log.

### Proximity: `near(a, b, dist)`

Returns `1` if the `dist` px box around the **center** of `b` touches actor `a` (`|centerX_a − centerX_b| ≤ dist` and the same in Y). Intended to "speak" / "use" attached to a character:
```c
void script_update(void) {
  // pegado al jugador + pulsas A → cambio a la escena 1
  if (near(gSelf, &gActors[PLAYER_INDEX], 20) && (gJp & KEY_A)) {
    switchScene(1);
  }
}
```
`dist` are screen pixels; 20 ≈ half the player's body. Adjust to the scale of your game.

### Key flank: `gJp`

`REG_KEYINPUT` tells whether a key is pressed **now**; `gJp` (just-pressed) has **only the bits that were pressed THIS frame** (rising edge). Same bits as `REG_KEYINPUT` (0 = pressed). Avoid saving the previous state by hand: `if (gJp & KEY_A)` is executed only once per press, even if you hold the key.

> The motor resets the edge when changing scenes so that the button that caused the change does not slip.

### What changes when changing scenes

- **Image, collision and camera** are per scene: `gColMap`/`gColCols`/`gColRows`/`gColTile` and `gCamX`/`gCamY` are updated on load (they are no longer `CAM_X`/`CAM_Y` macros in multi-scene; use them as variables).
- **Actors**: each scene sets **its** in `gActors[0..count-1]`. `ACTOR_COUNT` is the maximum among all scenes; the remaining spaces are set to 0 (`frameCount == 0`) and are not drawn or collided.
- **Scripts**: The script assigned to an actor is called with `gSelf` pointing to THAT actor (its scene index). Putting a script on a new actor from another scene = changing scenes instantly.- **Player**: `PLAYER_INDEX` is always `0`, so in each scene the actor in position 0 is the "player" of that scene (scripts move it; if your actor has no collider, `updatePlayer` does nothing).- **Music**: for now only the song from the **starting scene** plays; music per scene is pending.- `sceneData` in the generated code is ALWAYS the starting scene (after the splash); the others go `sceneData_1 … sceneData_{N-1}` (not the references with fixed indexes: they are generated names).

---

## 10.16. Optimization and golden rules

### The most important thing: not to break the frame budget

- **~83,800 cycles** of VBLANK.
- Sprite render: **~15 cycles/opaque pixel** (deleted by deltas of the previous rect + painted with transparency by "skip").
- Loose limit: **~5,600 px of sprite in camera**. A 21x31 (651px) actor costs ~10K cycles; three like this ~30 K, there is room left.
- Off camera the cost is ~0 (the `drawActorRect` clamps and returns).

### CPU cost rules (ARM7TDMI)

| Operation | Relative cost | Council |
| :--- | :--- | :--- |
| Sum/product `int` | 1 | Your daily bread |
| `>>` / `<<` | 1 | Use powers of 2 to divide/multiply |
| `%` (module) | very high | Avoid `%n`; if `n` is power of 2, use `& (n-1)` |
| `/` division | very high | Avoid dividing by non-power of 2 constants |
| `float` | catastrophic | Banned |
| EWRAM Access | slow | Large tables in `const` (ROM), buffer in EWRAM |
| 76KB `memcpy` | slow | The engine now avoids copying the entire scene |

Examples:
```c
// mal (cada frame):
// int idx = p->frame % 13;
// bien:
int idx = p->frame & 15;       // asumiendo frameCount = 16 o potencia de 2

// mal: vx /= 10;   → mejor:
vx -= vx / 8;                  // o vx >>= 3 si no necesitas precisión
```
### Recommended own optimizations

- Declare small `static inline` functions (it tells the `-O2` compiler to expand them).
- Make the tables 'const': they will live in ROM and do not dirty EWRAM or IWRAM.
- Access VRAM as `u16*` with local buffer, not with `volatile` pointers in the inner loop (the template already does this).
- Reuse the actor's free fields (`vx`, `vy`, `timer`, `dir`) rather than declaring 50 of your own global variables.
- If you paint something of your own (mini-bar, precomputed text), do it within the same VBLANK and with few pixels.

### Cases that look bad in real console but not in gbajs

- Tear/flicker in the lower area of the screen → VBLANK override.
- I play at half FPS → the entire frame does more work than it fits.
- The solution for both is to reduce work per frame (visible actors, own pixels, lightweight scripts), not patch.

---

## 10.17. Debugging in the real console vs. emulators

| Environment | What it detects | What is hidden |
| :--- | :--- | :--- |
| **Built-in emulator (gbajs)** | Logic, collisions, transitions | Intraframe timing (VRAM copy at the end of the frame) |
| **mGBA** | VBLANK Timing, precise | — (very faithful) |
| **Flashcart / real GBA** | Everything real | — |

### Debugging techniques without `printf`

1. **Pause by button:** lock the game and advance frame by frame.
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
. **Visible states in the sprite:** changes the actor's frame according to a state (cheap state tag).
3. **Sentinel flashing:** toggles the color of a pixel on the screen (`screen[y*240+x]`) to count loops or detect paths not taken.
4. **Counters in `gActors`:** Write a debug value to `p->vx` and see it in the emulator loggers with frame-step.

### The export console

You will see the export warnings (`[WARN]`, `[OK]`) in the bottom panel of the editor when **EXPORT** or when compiling with **PLAY**. Pay attention to:
- Scripts without `script_update()`.
- duplicate `script_init/update` (repeated symbols).
- Actors > 64 (they are truncated).
- Long transitions (remember to adjust speed).

---

## 10.18. Quick reference (cheat-sheet)

### Template constants and symbols

| Symbol | Value | Note |
| :--- | :--- | :--- |
| `SCREEN_W`, `SCREEN_H` | 240, 160 | pixels |
| `PIXEL_COUNT` | 38400 | 240×160 |
| `VRAM` | `0x06000000` | `screen = (u16*)VRAM` |
| `ACTOR_COUNT` | 1-64 | according to exported actors |
| `PLAYER_INDEX` | 0 | the actor 0 |
| `WALK_SPEED` / `RUN_SPEED` | 23 | px/vsync (shoulder = run) |
| `ACCEL` / `FRICTION` | 1 / 1 | acceleration and braking |
| `GRAVITY` / `MAX_FALL` | 1 / 5 | px/vsync² and terminal speed |
| `JUMP_VEL` / `JUMP_CUT_VEL` | -11 / -3 | jump boost and cut || `COYOTE_FRAMES` / `JUMP_BUFFER` | 5/5 | margin behind the edge / before landing || `MAX_ACTOR_FRAMES` | 32 | frames by actor || `CAM_X`, `CAM_Y` | 0 by default | world offset (single-scene); in multi-scene `gCamX`/`gCamY` |
| `gScene` / `gSceneTarget` | — | current scene / requested scene (multi-scene) |
| `gJp` | — | key edge: bits pressed THIS frame |
| `gActorBack[]` | EWRAM | actors background |
| `gActors[]` | — | globallist |

###Records

| Registration | Dir | Read/Use |
| :--- | :--- | :--- |
| `REG_DISPCNT` | `0x04000000` | `MODE_3 \\| BG2_ENABLE` |
| `REG_VCOUNT` | `0x04000006` | current scanline |
| `REG_KEYINPUT` | `0x04000130` | buttons (0=pressed) |
| `REG_SND1SWEEP/CNT/FREQ` | `0x60/62/64` | channel 1 |
| `REG_SND2CNT/FREQ` | `0x68/6C` | channel 2 |
| `REG_SND3CNT_L/H, FREQ` | `0x70/72/74` | channel 3 wave |
| `REG_SND4CNT/FREQ` | `0x78/7C` | channel 4 noise |
| `REG_SNDCTL/CNTH/CNTX/BIAS` | `0x80/82/84/88` | master |

### `REG_KEYINPUT` bitmap
```
bit 0 A · bit 1 B · bit 2 SELECT · bit 3 START
bit 4 RIGHT · bit 5 LEFT · bit 6 UP · bit 7 DOWN
bit 8 R · bit 9 L   —  bit = 0 → PULSADO
```

```c
u16 keys = ~REG_KEYINPUT & 0x3FF;          // con 1 = pulsado
u16 jp   = keys & ~prevKeys; prevKeys = keys; // flanco
```
### Useful Features

| Function | Result |
| :--- | :--- |
| `waitVSync()` | wait for VBLANK |
| `actorBox(a,&bx,&by,&bw,&bh)` | collider in world coords |
| `rectHitsSolid(bx,by,bw,bh,dx,dy)` | Does it collide with tiles? |
| `moveActorCollide(a,dx,dy)` | moves with collision, by axes |
| `gSelf->animSpeed` | animation step/vsync (2 = double, see [10.8](#108-actor-system-game-entities)) |
| `movePlayer(keys,p)` | Player's D-pad |
| `updatePlayer()` | input + push actor-actor |
| `showDialogue(id)` | show dialog `id` from row 0 (see [10.13.1](#10131-dialogs-and-languages)) |
| `showDialogueRow(key)` | jump to a row by its code or ID |
| `nextDialogueRow()` | advance to the next row |
| `dialogueUpdate()` | advances only when pressing A (call each frame) |
| `aeSaveHasGame()` | Is there a valid saved game? |
| `aeSaveWrite(data, size)` | save in SRAM (0 ok, -1 if it doesn't fit) |
| `aeSaveRead(data, size)` | SRAM load (0 ok, -1 no start) |
| `aeSaveClear()` | delete the game |
| `hideDialogue()` | hide the dialog |
| `gLang = n` | choose the language (0 = first column, 1 = second…) |
| `initActors()` / `advanceAllActors()` | automatic animation |
| `drawAllActors(screen)` | z-sort + drawn |
| `near(a,b,dist)` | ±`dist` px between centers? (proximity) |
| `switchScene(n[, "name"])` | change scene with connection transition (multi-scene) |
| `noteOn(ch,&inst,period)` | shoot a note/SFX |

### Formulas| Formula | Usage || :--- | :--- || `RGB555(r,g,b) = ((r>>3)|((g>>3)<<5)|((b>>3)<<10)) & 0x7FFF` | pixel color |
| `period = round(2048 − 131072/freq)` | note → period record |
| `6.7 MHz → 280,896 cycles/frame → 59.73 fps` | base timing |
| `sprite pixels in camera ≤ ~5,600` | VBLANK budget |

---

## 10.19. Glossary

- **AABB** — axle-aligned box; the actor's collision rect.
- **APU** — Audio Processing Unit (the sound part of the GBA).
- **BG2_ENABLE** — bit that activates the MODE 3 bitmap.
- **EWRAM** — External Work RAM, 256 KB, slow.
- **IWRAM** — Internal Work RAM, 32 KB, fast (stack).
- **Key-on** — bit that "turns on" the channel note (in `REG_*FREQ`, bit 14 of the value that writes `noteOn`).
- **MODE 3** — 240×160 bitmap mode with RGB555 pixels.
- **OAM** — Attribute Memory object: hardware sprite table (not used by the engine).
- **PPU** — pixel painting unit.
- **RGB555** — 15 bits of spot color (5 per channel).
- **Scanline / VCOUNT** — current horizontal LCD line; `REG_VCOUNT` reads it.
- **VBLANK** — vertical blanking period (68 lines): safe time to paint.
- **Vsync** — "vertical sync": the wait for `waitVSync()`. 1 frame.
- **z-sort** — sort actors by `z` to decide who covers who.
- **Wave RAM** — bank of 16 4-bit samples from channel 3.
- **Thumb / ARM** — the two instruction sets of the ARM7TDMI.

---

**Previous:** [09 — Export and test](09-exportar.md) · **Return to [index](README.md)**