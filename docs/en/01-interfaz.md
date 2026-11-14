#01 — Application interface

> **Note:** This translation may contain errors, as the original documentation was written in Spanish.

> **Note:** This translation may contain errors, as the original documentation was written in Spanish.

> **Note:** This translation may contain errors, as the original documentation was written in Spanish.

## 1.1. Title bar

At the top the logo and name of the application (**AdvanceEngine**), the version in use and access to **Documentation**, **Credits** and **Options** are shown.

From here the window is also closed with the ✕ button.

## 1.2. Options menu

Option | State | Description
:--- | :--- | :---
**Language** | Coming soon | Change of interface language.
**Appearance** | Operational | Open the visual theme selector.
**Scale** | Coming soon | Interface scaling adjustment.

## 1.3. Launcher tabs

The bottom bar of the launcher groups the three main views:

- **Recent:** recently opened projects.
- **Create:** project creation form.
- **Import:** linking of existing projects.

## 1.4. Project editor

When you open a project you enter the **editor**, a full screen screen with:

### Application menus (top left bar)
- **File:** new project, open, save (Ctrl+S), save as, exit to project list, reload or close.
- **Edit:** undo (Ctrl+Z), redo (Ctrl+Y), cut/copy/paste, delete (Del) and select all (Ctrl+A).
- **View / Run:** start (Play), stop (Stop) and export GBA ROM.
- **Window / Help:** access to modules, theme, language and visibility of collisions/connections.

### Module tabs (centered)
The editor has the following module tabs:| Tab | Module || :--- | :--- |
| World | Scenes, actors and collisions. || Scripting | Game logic (coming soon). |
| Sprite | Sprite sheets and animations. |
| Image | Backgrounds and layers. |
| Music | Chiptune sequencer. |
| Sound | Sound effects. |
| Dialogue | Conversations and texts. |

In each tab the project name appears centered at the top, with a `*` indicator if there are unsaved changes. The active tab is highlighted with an accent color top border.

### Right editor bar

- **IMPORT:** incorporates external assets to the project (images, sounds, sprites, etc.).
- **EXPORT:** drop-down menu with output actions:
  - Save project.
  - Export GBA ROM (compiles and generates the executable ROM, and opens the build folder).
  - Export songs, sprites, backgrounds and scripts.
  -Open the project folder.
- **PLAY:** compiles the current state and runs it in the built-in emulator.
- **STOP:** stops the emulator.

![SHAPTURE: editor top bar with modules, IMPORT, EXPORT and PLAY tabs → `assets/editor-bar.png`]

## 1.5. debug console

The bottom panel of the editor displays the **debug console**, where the following are recorded:
- Loading of projects and asset routes.
- Build output when running PLAY or exporting the ROM.
- Alerts for missing dependencies, performance and unused code for ROM optimization.![SHAPTURE: bottom console with build output → `assets/editor-consola.png`]

---

**Next:** [02 — World Module](02-mundo.md)