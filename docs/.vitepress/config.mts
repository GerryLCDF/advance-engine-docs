import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AdvanceEngine Docs',
  description: 'Documentación de AdvanceEngine',
  base: '/advance-engine-docs/',
  lang: 'es-ES',
  head: [['link', { rel: 'icon', href: '/logo.svg' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Inicio', link: '/' },
      { text: 'itch.io', link: 'https://gerardolcdf.itch.io/advanceengine' }
    ],
    sidebar: [
      { text: 'README', link: '/' },
      { text: '00 — Primeros pasos', link: '/00-inicio' },
      { text: '01 — Interfaz', link: '/01-interfaz' },
      { text: '02 — Mundo', link: '/02-mundo' },
      { text: '03 — Sprite', link: '/03-sprite' },
      { text: '04 — Imagen', link: '/04-imagen' },
      { text: '05 — Music', link: '/05-music' },
      { text: '06 — Sound', link: '/06-sound' },
      { text: '07 — Diálogo', link: '/07-dialogo' },
      { text: '08 — Scripting', link: '/08-scripting' },
      { text: '09 — Exportar', link: '/09-exportar' },
      { text: '10 — Programar en C', link: '/10-programar-c-gba' },
      { text: '11 — Manual completo', link: '/11-manual-completo' }
    ],
    search: { provider: 'local' },
    outline: 'deep'
  }
})
