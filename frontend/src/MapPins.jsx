// frontend/src/MapPins.jsx
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { latLngBounds } from "leaflet";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api";

/* ===================== axios público (sin Authorization) ===================== */
const publicApi = axios.create();

/* ===================== Helpers de auth & tokens (axios global autenticado) ===================== */
function setAuthHeader(access) {
  if (access) axios.defaults.headers.common["Authorization"] = `Bearer ${access}`;
  else delete axios.defaults.headers.common["Authorization"];
}
function setTokens({ access, refresh }) {
  if (access) localStorage.setItem("access", access);
  if (refresh) localStorage.setItem("refresh", refresh);
  setAuthHeader(access);
}
function clearAuth() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  localStorage.removeItem("username");
  setAuthHeader(null);
}
function getAccess() { return localStorage.getItem("access"); }
function getRefresh() { return localStorage.getItem("refresh"); }
function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch { return null; }
}
const savedAccessBoot = getAccess();
if (savedAccessBoot) setAuthHeader(savedAccessBoot);

/** Refresca el access si está vencido o cerca de vencer. Lanza "SESSION_EXPIRED" si no puede. */
async function ensureAccessValid() {
  const access = getAccess();
  if (!access) throw new Error("SESSION_EXPIRED");
  const payload = decodeJwt(access);
  const now = Math.floor(Date.now() / 1000);
  if (!payload || (payload.exp ?? 0) <= now + 10) {
    const refresh = getRefresh();
    if (!refresh) throw new Error("SESSION_EXPIRED");
    const { data } = await publicApi.post(
      `${API.replace(/\/$/, "")}/token/refresh/`,
      { refresh },
      { headers: { "Content-Type": "application/json" } }
    );
    const newAccess = data?.access;
    if (!newAccess) throw new Error("SESSION_EXPIRED");
    setTokens({ access: newAccess, refresh });
  }
}

/* ===================== Interceptor axios: refresh automático por si igual llega 401 ===================== */
axios.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const original = error.config;
    const status = error?.response?.status;
    if (!original || original._retry || status !== 401) throw error;

    const refresh = getRefresh();
    if (!refresh) {
      clearAuth();
      throw error;
    }

    original._retry = true;
    try {
      const { data } = await publicApi.post(
        `${API.replace(/\/$/, "")}/token/refresh/`,
        { refresh },
        { headers: { "Content-Type": "application/json" } }
      );
      const newAccess = data?.access;
      if (!newAccess) {
        clearAuth();
        throw error;
      }
      setTokens({ access: newAccess, refresh });
      return axios(original);
    } catch {
      clearAuth();
      throw error;
    }
  }
);

/* ====== Helper para elegir cliente HTTP según haya sesión o no ====== */
function getHttpClient(hasUser) {
  // Si hay usuario logueado, usamos axios (con Authorization)
  return hasUser ? axios : publicApi;
}

/* ===================== Loader (bbox + fallback + fitBounds) ===================== */
function BoundsLoader({ onPins, onError, hasUser }) {
  const map = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    const load = async () => {
      try {
        const client = getHttpClient(hasUser);
        const b = map.getBounds();
        const url = `${API}/pins/?in_bbox=${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
        const { data } = await client.get(url);
        let list = Array.isArray(data) ? data : [];

        if (list.length === 0) {
          const all = await client.get(`${API}/pins/`);
          list = Array.isArray(all.data) ? all.data : [];
          console.log("[Pins] bbox vacío, fallback ALL:", list.length, "(authed:", !!hasUser, ")");
        } else {
          console.log("[Pins] bbox:", list.length, "(authed:", !!hasUser, ")");
        }

        onPins(list);

        if (!didFit.current && list.length > 0) {
          const points = list
            .filter((p) => p.lat != null && p.lng != null)
            .map((p) => [Number(p.lat), Number(p.lng)]);
          if (points.length > 0) {
            const bounds = latLngBounds(points).pad(0.2);
            map.fitBounds(bounds, { animate: true });
            didFit.current = true;
          }
        }
      } catch (err) {
        console.error("GET /pins bbox failed", err.response?.status, err.response?.data || err);
        onError?.("No se pudo cargar pines por bbox");
      }
    };

    load(); // carga inicial
    map.on("moveend", load);
    return () => map.off("moveend", load);
  }, [map, onPins, onError, hasUser]); // <- depende de hasUser para refetch al loguear/desloguear

  return null;
}

/* ===================== Componente principal ===================== */
export default function MapPins() {
  const [pins, setPins] = useState([]);
  const [draft, setDraft] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [error, setError] = useState("");

  // Reconstruye usuario desde storage (id desde JWT; username si lo guardamos antes)
  const initialUser = useMemo(() => {
    const access = getAccess();
    if (!access) return null;
    const payload = decodeJwt(access);
    return {
      token: access,
      id: payload?.user_id != null ? Number(payload.user_id) : null,
      username: localStorage.getItem("username") || null,
    };
  }, []);
  const [user, setUser] = useState(initialUser);

  const center = useMemo(() => [-34.9011, -56.1645], []);

  // Refetch helper (ALL pins) que respeta sesión
  const reloadAllPins = async (hasUserNow) => {
    try {
      const client = getHttpClient(hasUserNow);
      const { data } = await client.get(`${API}/pins/`);
      if (Array.isArray(data)) {
        setPins(data);
        console.log("[Pins] reload ALL:", data.length, "(authed:", !!hasUserNow, ")");
      }
    } catch (err) {
      console.error("GET /pins (ALL) failed", err.response?.status, err.response?.data || err);
      setError("No se pudo cargar el listado inicial de pines");
    }
  };

  // Fetch inicial de TODOS los pines (authed si hay sesión)
  useEffect(() => {
    reloadAllPins(!!user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // cuando cambia el user (login/logout), recargamos con/ sin auth

  function ClickToAdd() {
    useMapEvents({
      click(e) {
        if (!user) return; // solo logueados pueden crear
        setDraft(e.latlng);
      },
    });
    return null;
  }

  /* ===== Crear pin (axios autenticado) ===== */
  async function createPin(ev) {
    ev.preventDefault();
    if (!draft || !user) return;

    const formEl = ev.currentTarget;
    const form = new FormData(formEl);

    // ⬇️ Ahora todos los pines nuevos quedan "pending" y no públicos
    const payload = {
      title: form.get("title") || "",
      description: form.get("description") || "",
      images: [],
      lat: Number(draft.lat.toFixed(6)),
      lng: Number(draft.lng.toFixed(6)),
      status: "pending",
      is_public: false,
    };

    try {
      await ensureAccessValid(); // asegura access válido
      const { data } = await axios.post(`${API}/pins/`, payload, {
        headers: { "Content-Type": "application/json" },
      });
      // Lo verás vos aunque esté pending (el backend te devuelve tus propios pines)
      setPins((p) => [data, ...p]);
      formEl.reset();
      setDraft(null);
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (err.message === "SESSION_EXPIRED" || status === 401) {
        clearAuth();
        setUser(null);
        alert("Tu sesión expiró. Iniciá sesión nuevamente.");
        return;
      }
      console.error("POST /pins/ failed", status, data || err);
      alert("No se pudo crear el pin: " + JSON.stringify(data ?? {}, null, 2));
    }
  }

  /* ===== Login / Registro (usa publicApi) ===== */
  async function handleAuth(ev) {
    ev.preventDefault();
    const form = new FormData(ev.currentTarget);
    const username = form.get("username");
    const password = form.get("password");

    try {
      if (authMode === "register") {
        await publicApi.post(`${API.replace(/\/$/, "")}/register/`, { username, password }, {
          headers: { "Content-Type": "application/json" },
        });
        alert("Registro OK. Ahora iniciá sesión.");
        setAuthMode("login");
        ev.currentTarget.reset();
      } else {
        const { data } = await publicApi.post(`${API.replace(/\/$/, "")}/token/`, { username, password }, {
          headers: { "Content-Type": "application/json" },
        });
        const access = data?.access;
        const refresh = data?.refresh;
        if (!access || !refresh) throw new Error("Tokens inválidos");
        setTokens({ access, refresh });
        localStorage.setItem("username", username);
        const payload = decodeJwt(access);
        const newUser = { username, token: access, id: payload?.user_id != null ? Number(payload.user_id) : null };
        setUser(newUser);
        // 🔁 Refetch inmediato con Authorization para que user_confirmed llegue correcto
        reloadAllPins(true);
      }
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      const detail = data?.detail || data?.message || (typeof data === "string" ? data : null);
      console.error("Auth error", status, data || err);
      alert(`Error de autenticación (${status ?? "?"}): ${detail ?? JSON.stringify(data ?? {}, null, 2)}`);
    }
  }

  function logout() {
    clearAuth();
    setUser(null);
    setDraft(null);
    // 🔁 Refetch como invitado para limpiar user_confirmed
    reloadAllPins(false);
  }

  /* ===== Helpers de color ===== */
  const nextColor = (count) => {
    if (count <= 0) return "gray";
    if (count === 1) return "blue";
    if (count === 2) return "yellow";
    if (count <= 5) return "orange";
    return "red";
  };
  const colorToHex = (c) =>
    ({ blue: "#1976d2", yellow: "#fbc02d", orange: "#fb8c00", red: "#e53935", gray: "#9e9e9e" }[c] || "#9e9e9e");
  const isOwnPin = (p) => user && Number(p.created_by) === Number(user.id);

  /* ===== Confirmar / Quitar confirmación (optimistic UI; axios autenticado) ===== */
  async function toggleConfirm(pin) {
    if (!user) return alert("Iniciá sesión para confirmar.");
    if (isOwnPin(pin)) return; // no ejecutar en pin propio
    if (pin.status !== "active") return; // no confirmar pines no activos

    const url = `${API}/pins/${pin.id}/confirm/`;
    const prevSnap = { ...pin };
    const optimisticAdd = !pin.user_confirmed;

    // Optimistic UI
    setPins((arr) =>
      arr.map((p) => {
        if (p.id !== pin.id) return p;
        const newCount = Math.max(0, (p.confirmations_count || 0) + (optimisticAdd ? 1 : -1));
        return { ...p, user_confirmed: optimisticAdd, confirmations_count: newCount, color: nextColor(newCount) };
      })
    );

    try {
      await ensureAccessValid(); // asegura access válido antes de llamar
      const method = pin.user_confirmed ? "delete" : "post";
      const { data } = await axios({ url, method }); // axios con Authorization
      setPins((arr) => arr.map((p) => (p.id === data.id ? data : p)));
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (err.message === "SESSION_EXPIRED" || status === 401) {
        clearAuth();
        setUser(null);
        alert("Tu sesión expiró. Iniciá sesión nuevamente.");
      } else {
        console.error("confirm toggle failed", status, data || err);
        alert("Error al confirmar: " + JSON.stringify(data ?? {}, null, 2));
      }
      // Revertir UI
      setPins((arr) => arr.map((p) => (p.id === prevSnap.id ? prevSnap : p)));
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", height: "100vh" }}>
      <div>
        <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Loader que se engancha al mapa (bbox + fallback + fitBounds) */}
          <BoundsLoader onPins={setPins} onError={setError} hasUser={!!user} />

          <ClickToAdd />

          {pins.map((p) => (
            <CircleMarker
              key={p.id}
              center={[Number(p.lat), Number(p.lng)]}
              pathOptions={{
                color: colorToHex(p.color),
                weight: 2,
                fillColor: colorToHex(p.color),
                fillOpacity: 0.5,
              }}
              radius={10}
            >
              <Popup>
                <b>{p.title || "Actividad sospechosa"}</b>
                <br />
                {p.description}
                <br />
                <small>
                  Estado: <b>{p.status}</b> — Confirmaciones: {p.confirmations_count} —{" "}
                  <span style={{ color: colorToHex(p.color) }}>{p.color}</span>
                </small>
                <div style={{ marginTop: 8 }}>
                  {user ? (
                    isOwnPin(p) ? (
                      p.status === "pending" ? (
                        <em style={{ color: "#555" }}>Pendiente de aprobación del admin</em>
                      ) : null
                    ) : p.status === "active" ? (
                      <button onClick={() => toggleConfirm(p)}>
                        {p.user_confirmed ? "Quitar confirmación" : "Confirmar"}
                      </button>
                    ) : null
                  ) : (
                    <span style={{ fontSize: 12, color: "#666" }}>Inicia sesión para confirmar</span>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {user && draft && (
            <CircleMarker
              center={[draft.lat, draft.lng]}
              radius={10}
              pathOptions={{ color: "#555", weight: 2, fillOpacity: 0.1 }}
            >
              <Popup>Nuevo pin aquí</Popup>
            </CircleMarker>
          )}
        </MapContainer>
      </div>

      <div style={{ padding: "16px", borderLeft: "1px solid #ddd", overflow: "auto" }}>
        {/* Info de depuración visible */}
        <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
          Pins cargados: <b>{pins.length}</b>
          {error ? <> — <span style={{ color: "crimson" }}>{error}</span></> : null}
        </div>

        {/* Cuenta */}
        <div style={{ marginBottom: 16, borderBottom: "1px solid #eee", paddingBottom: 12 }}>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>Sesión iniciada{user.username ? `: ${user.username}` : ""}</div>
              <button onClick={logout}>Cerrar sesión</button>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => setAuthMode("login")}
                  style={{ fontWeight: authMode === "login" ? "bold" : "normal" }}
                >
                  Iniciar sesión
                </button>
                <button
                  onClick={() => setAuthMode("register")}
                  style={{ fontWeight: authMode === "register" ? "bold" : "normal" }}
                >
                  Registrarse
                </button>
              </div>
              <form onSubmit={handleAuth}>
                <label style={{ display: "block", marginTop: 6 }}>
                  Usuario
                  <input name="username" required style={{ width: "100%" }} />
                </label>
                <label style={{ display: "block", marginTop: 6 }}>
                  Contraseña
                  <input name="password" type="password" required style={{ width: "100%" }} />
                </label>
                <button type="submit" style={{ marginTop: 8 }}>
                  {authMode === "login" ? "Entrar" : "Crear cuenta"}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Crear pin (solo logueado) */}
        <h3>Agregar pin</h3>
        {user ? (
          draft ? (
            <form onSubmit={createPin}>
              <label style={{ display: "block", marginTop: 8 }}>
                Título
                <input name="title" placeholder="Opcional" style={{ width: "100%" }} />
              </label>
              <label style={{ display: "block", marginTop: 8 }}>
                Descripción
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Info útil, sin datos personales"
                  style={{ width: "100%" }}
                />
              </label>
              <p style={{ fontSize: 12, color: "#555" }}>
                Ubicación: {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="submit">Guardar</button>
                <button type="button" onClick={() => setDraft(null)}>
                  Cancelar
                </button>
              </div>
              <p style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
                ⚠️ No subas fotos con caras, patentes o domicilios. Esta es información comunitaria.
              </p>
            </form>
          ) : (
            <p>Toca el mapa para elegir la ubicación del pin.</p>
          )
        ) : (
          <p>Inicia sesión para agregar y confirmar pines. Como invitado, solo puedes ver el mapa.</p>
        )}
      </div>
    </div>
  );
}
