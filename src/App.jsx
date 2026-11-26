import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'moto_pagos_presupuestos_v1';
const ACTIVE_ID_KEY = 'moto_pagos_active_id_v1';

// Porcentajes de comisión por conversión de intrafinanciamiento según el plazo
const COMMISSION_RATES = {
  12: 0.13, // 13% para 12 meses
  18: 0.18, // 18% para 18 meses
  24: 0.24, // 24% para 24 meses
};

const TERM_OPTIONS = [12, 18, 24];

function formatHNL(amount) {
  const num = Number(amount) || 0;
  return (
    'L ' +
    num.toLocaleString('es-HN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// Comprime y recorta la imagen en cuadrado 1:1 para evitar exceder el límite de LocalStorage
function processImageToSquareDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetSize = 720;
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');

        // Recorte cuadrado centrado (1:1)
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetSize, targetSize);
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);

        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function calculatePlan(price, downPayment, months) {
  const safePrice = Math.max(0, Number(price) || 0);
  const safeDownPayment = Math.max(0, Number(downPayment) || 0);
  const safeMonths = COMMISSION_RATES[months] ? Number(months) : 12;
  const rate = COMMISSION_RATES[safeMonths];

  const financedAmount = Math.max(0, safePrice - safeDownPayment);
  const monthlyPayment = safeMonths > 0 ? financedAmount / safeMonths : 0;
  const commission = financedAmount * rate;
  const firstPayment = commission + monthlyPayment;
  const initialOutlay = safeDownPayment + commission + firstPayment;

  return {
    price: safePrice,
    downPayment: safeDownPayment,
    months: safeMonths,
    rate,
    financedAmount,
    monthlyPayment,
    commission,
    firstPayment,
    initialOutlay,
  };
}

export default function App() {
  const [budgets, setBudgets] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Fallback empty array
    }
    return [];
  });

  const [activeBudgetId, setActiveBudgetId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_ID_KEY) || '';
    } catch {
      return '';
    }
  });

  // Si no hay presupuestos guardados, mostrar el formulario de creación
  const [isCreating, setIsCreating] = useState(() => budgets.length === 0);

  // Estado del formulario de creación de nuevo presupuesto
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newPhoto, setNewPhoto] = useState('');
  const [createError, setCreateError] = useState('');

  // Estado para instalación PWA
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const editFileInputRef = useRef(null);
  const createFileInputRef = useRef(null);

  // Sincronizar lista de presupuestos en localStorage automáticamente
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(budgets));
    } catch {
      // Storage quota check
    }
  }, [budgets]);

  // Sincronizar presupuesto activo en localStorage
  useEffect(() => {
    try {
      if (activeBudgetId) {
        localStorage.setItem(ACTIVE_ID_KEY, activeBudgetId);
      } else {
        localStorage.removeItem(ACTIVE_ID_KEY);
      }
    } catch {
      // Ignore storage error
    }
  }, [activeBudgetId]);

  // Capturar evento beforeinstallprompt para PWA instalable
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const activeBudget =
    budgets.find((b) => b.id === activeBudgetId) || budgets[0] || null;

  useEffect(() => {
    if (activeBudget && activeBudget.id !== activeBudgetId) {
      setActiveBudgetId(activeBudget.id);
    }
  }, [activeBudget?.id, activeBudgetId]);

  // Función que actualiza el presupuesto activo en tiempo real y recalcula inmediatamente
  const updateActiveBudgetFields = (patch) => {
    if (!activeBudget) return;
    setBudgets((prev) =>
      prev.map((item) =>
        item.id === activeBudget.id
          ? {
              ...item,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    );
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  // Subida de foto en creación
  const handleCreatePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const squareDataUrl = await processImageToSquareDataUrl(file);
      setNewPhoto(squareDataUrl);
    } catch {
      setCreateError('No se pudo cargar la imagen seleccionada.');
    }
  };

  // Subida de foto en pantalla de formulario (actualización instantánea)
  const handleActivePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const squareDataUrl = await processImageToSquareDataUrl(file);
      updateActiveBudgetFields({ photo: squareDataUrl });
    } catch {
      // Ignore invalid image
    }
  };

  // Crear nuevo presupuesto
  const handleCreateBudget = (e) => {
    e.preventDefault();
    setCreateError('');

    const trimmedName = newName.trim();
    const numericPrice = parseFloat(newPrice);

    if (!trimmedName) {
      setCreateError('Por favor ingresa el nombre de la moto o presupuesto.');
      return;
    }

    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
      setCreateError('Por favor ingresa un precio válido en Lempiras.');
      return;
    }

    const id = 'moto_' + Date.now();
    const created = {
      id,
      name: trimmedName,
      photo: newPhoto || '',
      price: numericPrice,
      downPayment: 0,
      months: 12,
      updatedAt: new Date().toISOString(),
    };

    const nextBudgets = [created, ...budgets];
    setBudgets(nextBudgets);
    setActiveBudgetId(id);
    setNewName('');
    setNewPrice('');
    setNewPhoto('');
    setIsCreating(false);
  };

  const handleDeleteCurrentBudget = () => {
    if (!activeBudget) return;
    const remaining = budgets.filter((b) => b.id !== activeBudget.id);
    setBudgets(remaining);
    if (remaining.length > 0) {
      setActiveBudgetId(remaining[0].id);
    } else {
      setActiveBudgetId('');
      setIsCreating(true);
    }
  };

  // Cálculos en tiempo real cada vez que cambia cualquier campo o plazo seleccionado
  const liveCalc = activeBudget
    ? calculatePlan(
        activeBudget.price,
        activeBudget.downPayment,
        activeBudget.months
      )
    : calculatePlan(0, 0, 12);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="top-bar-title">Calculadora de Pagos de Moto</span>
        <span className="top-bar-subtitle">
          Intrafinanciamiento en Lempiras (HNL)
        </span>
      </header>

      {deferredPrompt && (
        <div className="install-banner">
          <span className="install-banner-text">
            Instala esta calculadora en tu teléfono para usarla sin conexión.
          </span>
          <button
            type="button"
            id="install-pwa-btn"
            className="btn-block btn-primary btn-sm"
            onClick={handleInstallClick}
          >
            Instalar aplicación (PWA)
          </button>
        </div>
      )}

      <main className="main-content block-stack">
        {/* Bloque de selección de presupuesto o creación de uno nuevo */}
        {budgets.length > 0 && !isCreating && (
          <section className="selector-block block-stack">
            <div>
              <label htmlFor="budget-selector" className="block-label">
                Mis presupuestos guardados ({budgets.length})
              </label>
              <select
                id="budget-selector"
                className="block-select"
                value={activeBudget?.id || ''}
                onChange={(e) => setActiveBudgetId(e.target.value)}
              >
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || 'Sin nombre'} — {formatHNL(b.price)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              id="new-budget-trigger-btn"
              className="btn-block btn-secondary btn-sm"
              onClick={() => {
                setCreateError('');
                setIsCreating(true);
              }}
            >
              + Crear nuevo cálculo o presupuesto
            </button>
          </section>
        )}

        {/* Pantalla para crear un nuevo cálculo o presupuesto */}
        {isCreating ? (
          <form
            id="create-budget-form"
            className="card-surface block-stack"
            onSubmit={handleCreateBudget}
          >
            <div>
              <h1 className="budget-title-heading">
                Nuevo presupuesto de moto
              </h1>
              <span className="block-helper">
                Ingresa los datos iniciales. Todo se guardará en tu dispositivo.
              </span>
            </div>

            {createError && <div className="error-banner">{createError}</div>}

            <div>
              <label htmlFor="create-moto-name" className="block-label">
                Nombre de la moto o presupuesto *
              </label>
              <input
                id="create-moto-name"
                type="text"
                className="block-input"
                placeholder="Ej. Honda XR 190L / Yamaha FZ"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="create-moto-price" className="block-label">
                Precio de la moto (L) *
              </label>
              <input
                id="create-moto-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className="block-input"
                placeholder="Ej. 68500"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                required
              />
            </div>

            <div>
              <span className="block-label">Foto de la moto (Opcional)</span>
              <div className="photo-block">
                <div className="photo-frame-1x1">
                  <img
                    src={newPhoto || './default-moto.svg'}
                    alt="Vista previa cuadrada 1:1 de la moto"
                  />
                </div>
                <div className="photo-action-wrapper block-stack">
                  <input
                    ref={createFileInputRef}
                    id="create-moto-photo"
                    type="file"
                    accept="image/*"
                    className="file-input-hidden"
                    onChange={handleCreatePhotoUpload}
                  />
                  <button
                    type="button"
                    id="select-create-photo-btn"
                    className="btn-block btn-secondary btn-sm"
                    onClick={() => createFileInputRef.current?.click()}
                  >
                    {newPhoto ? 'Cambiar foto seleccionada' : 'Seleccionar foto (1:1)'}
                  </button>
                  {newPhoto && (
                    <button
                      type="button"
                      id="remove-create-photo-btn"
                      className="btn-block btn-danger btn-sm"
                      onClick={() => setNewPhoto('')}
                    >
                      Quitar foto
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              id="save-new-budget-btn"
              className="btn-block btn-primary"
            >
              Crear presupuesto
            </button>

            {budgets.length > 0 && (
              <button
                type="button"
                id="cancel-create-btn"
                className="btn-block btn-secondary"
                onClick={() => setIsCreating(false)}
              >
                Cancelar y volver
              </button>
            )}
          </form>
        ) : (
          /* Pantalla estilo formulario en bloques apilados uno sobre otro con cálculo automático */
          activeBudget && (
            <div id="calculator-block-form" className="block-stack">
              {/* 1. Título: nombre de la moto o presupuesto */}
              <div className="field-block block-stack">
                <div>
                  <span className="block-label">Título del presupuesto</span>
                  <h1 className="budget-title-heading">
                    {activeBudget.name || 'Sin nombre'}
                  </h1>
                </div>
                <div>
                  <label htmlFor="edit-budget-name" className="block-label">
                    Editar nombre de la moto
                  </label>
                  <input
                    id="edit-budget-name"
                    type="text"
                    className="block-input"
                    value={activeBudget.name}
                    onChange={(e) =>
                      updateActiveBudgetFields({ name: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* 2. Foto ocupando el ancho máximo disponible, aspect ratio 1:1 */}
              <div className="photo-block">
                <div className="photo-frame-1x1">
                  <img
                    src={activeBudget.photo || './default-moto.svg'}
                    alt={activeBudget.name || 'Moto'}
                  />
                </div>
                <div className="photo-action-wrapper block-stack">
                  <input
                    ref={editFileInputRef}
                    id="edit-moto-photo"
                    type="file"
                    accept="image/*"
                    className="file-input-hidden"
                    onChange={handleActivePhotoUpload}
                  />
                  <button
                    type="button"
                    id="change-photo-btn"
                    className="btn-block btn-secondary btn-sm"
                    onClick={() => editFileInputRef.current?.click()}
                  >
                    {activeBudget.photo
                      ? 'Cambiar foto de la moto'
                      : 'Subir foto de la moto (1:1)'}
                  </button>
                </div>
              </div>

              {/* 3. Precio */}
              <div className="field-block">
                <label htmlFor="input-precio" className="block-label">
                  Precio (Lempiras)
                </label>
                <input
                  id="input-precio"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="block-input"
                  placeholder="0.00"
                  value={activeBudget.price === '' ? '' : activeBudget.price}
                  onChange={(e) =>
                    updateActiveBudgetFields({
                      price: e.target.value === '' ? '' : Number(e.target.value),
                    })
                  }
                />
                <span className="block-helper">
                  Precio: {formatHNL(liveCalc.price)}
                </span>
              </div>

              {/* 4. Prima */}
              <div className="field-block">
                <label htmlFor="input-prima" className="block-label">
                  Prima (Lempiras)
                </label>
                <input
                  id="input-prima"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="block-input"
                  placeholder="0.00"
                  value={
                    activeBudget.downPayment === ''
                      ? ''
                      : activeBudget.downPayment
                  }
                  onChange={(e) =>
                    updateActiveBudgetFields({
                      downPayment:
                        e.target.value === '' ? '' : Number(e.target.value),
                    })
                  }
                />
                <span className="block-helper">
                  Prima: {formatHNL(liveCalc.downPayment)}
                </span>
              </div>

              {/* 5. Monto a financiar (Precio - Prima) */}
              <div className="field-block field-block-computed">
                <span className="block-label">
                  Monto a financiar (Precio − Prima)
                </span>
                <span id="output-monto-financiar" className="currency-value">
                  {formatHNL(liveCalc.financedAmount)}
                </span>
                <span className="block-helper">
                  {formatHNL(liveCalc.price)} − {formatHNL(liveCalc.downPayment)}
                </span>
              </div>

              {/* 6. Botones de meses (Selección única: 12, 18, 24 meses) */}
              <div className="field-block">
                <span className="block-label">
                  Plazo en meses (Selecciona 1 opción)
                </span>
                <div className="months-stack">
                  {TERM_OPTIONS.map((term) => {
                    const isSelected = Number(liveCalc.months) === term;
                    const ratePercent = Math.round(COMMISSION_RATES[term] * 100);
                    return (
                      <button
                        key={term}
                        type="button"
                        id={`btn-meses-${term}`}
                        className={`month-option-btn ${isSelected ? 'selected' : ''}`}
                        aria-pressed={isSelected}
                        onClick={() =>
                          updateActiveBudgetFields({ months: term })
                        }
                      >
                        <span>{term} meses</span>
                        <span className="month-option-subtext">
                          Comisión por conversión: {ratePercent}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 7. Cuota mensual (Monto a financiar / Plazo) */}
              <div className="field-block field-block-computed">
                <span className="block-label">
                  Cuota mensual ({liveCalc.months} meses)
                </span>
                <span id="output-cuota-mensual" className="currency-value">
                  {formatHNL(liveCalc.monthlyPayment)}
                </span>
                <span className="block-helper">
                  Monto a financiar ({formatHNL(liveCalc.financedAmount)}) ÷{' '}
                  {liveCalc.months} meses
                </span>
              </div>

              {/* 8. Comisión (Monto a financiar * porcentaje según plazo) */}
              <div className="field-block field-block-computed">
                <span className="block-label">
                  Comisión de intrafinanciamiento (
                  {Math.round(liveCalc.rate * 100)}%)
                </span>
                <span id="output-comision" className="currency-value">
                  {formatHNL(liveCalc.commission)}
                </span>
                <span className="block-helper">
                  {formatHNL(liveCalc.financedAmount)} ×{' '}
                  {Math.round(liveCalc.rate * 100)}% (Plazo de{' '}
                  {liveCalc.months} meses)
                </span>
              </div>

              {/* 9. Primera cuota y Desembolso inicial */}
              <div className="field-block field-block-featured block-stack">
                <div>
                  <span className="block-label">
                    Primera cuota (Comisión + 1 cuota mensual)
                  </span>
                  <span
                    id="output-primera-cuota"
                    className="currency-value-featured"
                  >
                    {formatHNL(liveCalc.firstPayment)}
                  </span>
                  <span className="block-helper">
                    {formatHNL(liveCalc.commission)} (comisión) +{' '}
                    {formatHNL(liveCalc.monthlyPayment)} (cuota)
                  </span>
                </div>

                <div
                  style={{
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '14px',
                  }}
                >
                  <span className="block-label">
                    Desembolso inicial (Prima + Comisión + Primera cuota)
                  </span>
                  <span
                    id="output-desembolso-inicial"
                    className="currency-value-featured"
                  >
                    {formatHNL(liveCalc.initialOutlay)}
                  </span>
                  <span className="block-helper">
                    {formatHNL(liveCalc.downPayment)} (prima) +{' '}
                    {formatHNL(liveCalc.commission)} (comisión) +{' '}
                    {formatHNL(liveCalc.firstPayment)} (primera cuota)
                  </span>
                </div>
              </div>

              {/* Opción para eliminar el presupuesto actual */}
              <div className="field-block">
                <button
                  type="button"
                  id="btn-eliminar-presupuesto"
                  className="btn-block btn-danger btn-sm"
                  onClick={handleDeleteCurrentBudget}
                >
                  Eliminar este presupuesto
                </button>
              </div>
            </div>
          )
        )}
      </main>
    </div>
  );
}
