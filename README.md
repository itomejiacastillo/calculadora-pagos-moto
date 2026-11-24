# Calculadora de Pagos de Moto (PWA - Lempiras HNL)

Calculadora PWA instalable y optimizada para dispositivos móviles para estimar pagos e intrafinanciamiento de motocicletas en Lempiras hondureños (`L`).

## Características

- **PWA Instalable**: Incluye `manifest.json`, iconos vectoriales y `Service Worker` para uso sin conexión.
- **Almacenamiento 100% Local**: Todos los presupuestos, fotos (recortadas en proporción `1:1`) y cálculos se guardan automáticamente en `localStorage`.
- **Diseño en Bloques Verticales**: Todos los campos están dispuestos uno sobre otro en formato de bloque, sin filas ni grids, con colores sólidos limpios (sin degradados).
- **Tabla de Comisión por Plazo**:
  - **12 meses**: `13%` de comisión por conversión
  - **18 meses**: `18%` de comisión por conversión
  - **24 meses**: `24%` de comisión por conversión
- **Cálculos**:
  - **Monto a financiar**: `Precio − Prima`
  - **Cuota mensual**: `Monto a financiar ÷ Plazo`
  - **Comisión**: `Monto a financiar × Porcentaje según plazo`
  - **Primera cuota**: `Comisión + Cuota mensual`

## Despliegue en Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/itomejiacastillo/calculadora-pagos-moto)

El proyecto incluye el archivo [`netlify.toml`](./netlify.toml) preconfigurado con:
- **Build command**: `npm run build`
- **Publish directory**: `dist`

## Desarrollo Local

```bash
npm install
npm run dev
```
