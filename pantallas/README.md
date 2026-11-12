# 📺 Pantallas del Restaurante

Tu propio sistema para controlar las pantallas de los restaurantes **desde la casa u oficina**, con el celular o el computador. Parecido a apps como Screen Control, OptiSigns o Emity, pero tuyo y sin mensualidad.

## Cómo funciona (en 1 minuto)

```
 📱 Tu celular / PC                 ☁️ Servidor (en internet)                 📺 TVs en los locales
 ─────────────────                ────────────────────────                ──────────────────────
 Panel (index.html)  ── sube ──▶  Guarda fotos y videos      ◀── conecta ──  player.html?pantalla=centro-tv1
 "Pon esta promo"    ── orden ─▶  Avisa al instante (WebSocket) ── envía ──▶  Cambia el contenido solo
```

Estas apps funcionan todas así, con 3 piezas:
1. **Servidor**: guarda los archivos y qué le toca a cada pantalla.
2. **Panel**: una página web donde subes contenido y eliges qué va en cada TV.
3. **Reproductor**: una página que se abre en la TV a pantalla completa y nunca se cierra. Se queda conectada al servidor con un canal en tiempo real (WebSocket). Cuando cambias algo, el servidor le avisa y la TV cambia en 1 segundo.

## Qué puede hacer

- Subir imágenes y videos desde el celular (varios a la vez).
- Crear varias pantallas, por ejemplo `centro-caja` y `norte-terraza`.
- Elegir una lista de contenido para cada pantalla, en orden y con los segundos de cada imagen.
- Mandar una lista a **todas** las pantallas con un botón.
- **⚡ Mostrar YA**: pone una promo urgente encima de todo durante X minutos y después vuelve sola a lo normal.
- Ver qué pantallas están **en línea** (punto verde) o caídas.
- Recargar las pantallas a distancia.
- Si se cae el internet en el local, la TV **sigue mostrando** lo último que tenía.

## Probarlo en tu computador

Necesitas [Node.js](https://nodejs.org) (versión 18 o más).

```bash
cd pantallas
npm install
ADMIN_PASSWORD=miClave npm start        # en Windows: set ADMIN_PASSWORD=miClave && npm start
```

- Panel: http://localhost:3000
- Pantalla de prueba: http://localhost:3000/player.html?pantalla=local1

## Ponerlo en internet (para controlarlo desde casa)

El servidor tiene que estar en un lugar al que lleguen tanto tú como las TVs. Hay dos opciones:

**Opción A, recomendada: un servidor en la nube (VPS) por ~5 USD al mes** (DigitalOcean, Hetzner, Vultr, Contabo…)
```bash
# en el servidor (Ubuntu)
sudo apt install -y nodejs npm git
git clone <tu repo> && cd editor/pantallas && npm install
sudo npm i -g pm2
ADMIN_PASSWORD=unaClaveLarga PORT=80 pm2 start server.js --name pantallas
pm2 save && pm2 startup
```
Después entra a `http://IP-DEL-SERVIDOR`. Para usar un dominio con candado (https), pon Caddy o Cloudflare delante.

> ⚠️ No uses planes gratis tipo Render Free: borran los archivos subidos cada vez que se reinician.

**Opción B, gratis: un PC viejo en uno de los locales + [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)**. El túnel te da una dirección pública sin abrir puertos del router.

## Instalar cada TV

Cualquier aparato con navegador sirve. Lo más barato y estable es un **TV box Android o un Fire TV Stick**:

1. Instala una app "kiosco" que abre una página y no la deja cerrar, por ejemplo **Fully Kiosk Browser**.
2. Ponle como página de inicio: `https://TU-SERVIDOR/player.html?pantalla=centro-caja`
3. Actívale "iniciar al encender" y "no apagar pantalla".

En un Smart TV con navegador o en un mini PC con Chrome en modo kiosco también funciona:
`chrome --kiosk --autoplay-policy=no-user-gesture-required "https://TU-SERVIDOR/player.html?pantalla=centro-caja"`

Los videos se reproducen **sin sonido**, porque los navegadores bloquean el autoplay con audio. Funcionan mejor en **MP4 (H.264)**.

## Archivos

| Archivo | Qué es |
|---|---|
| `server.js` | El servidor: API, subida de archivos y tiempo real |
| `public/index.html` | El panel de control (móvil y PC) |
| `public/player.html` | El reproductor para cada TV |
| `data.json` | Se crea solo y guarda pantallas y listas |
| `uploads/` | Se crea sola y guarda tus imágenes y videos |

## Ideas para la versión 2
- Programar por horario: desayuno 7–11, almuerzo 12–16…
- Usuarios por local, con contraseña distinta para cada gerente.
- Menú con precios conectado al sistema POS.
- App de Android propia (APK) que guarde los videos en el aparato.
