// src/MapPins.jsx
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api";

function useBoundsLoader(setPins) {
  const mapRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const load = async () => {
      try {
        const b = map.getBounds();
        const url = `${API}/pins/?in_bbox=${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
        const { data } = await axios.get(url);
        setPins(data);
      } catch (err) {
        console.error("GET /pins/ failed", err.response?.data || err);
      }
    };

    load();
    map.on("moveend", load);
    return () => map.off("moveend", load);
  }, [setPins]);

  return { mapRef };
}

export default function MapPins() {
  const [pins, setPins] = useState([]);
  const [draft, setDraft] = useState(null); // {lat,lng}
  const { mapRef } = useBoundsLoader(setPins);
  const center = useMemo(() => [-34.9011, -56.1645], []);

  function ClickToAdd() {
    useMapEvents({
      click(e) {
        setDraft(e.latlng);
      },
    });
    return null;
  }

  async function createPin(ev) {
    ev.preventDefault();
    if (!draft) return;

    // Cacheamos el form ANTES del await (para poder resetearlo aunque el form se desmonte luego)
    const formEl = ev.currentTarget;
    const form = new FormData(formEl);

    const payload = {
      title: form.get("title"),
      description: form.get("description"),
      category: form.get("category"),
      tags: (form.get("tags") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      rating: form.get("rating") ? Number(form.get("rating")) : null,
      images: [],
      // Redondeo a 6 decimales (tu backend ahora usa FloatField, pero así evitamos ruido)
      lat: Number(draft.lat.toFixed(6)),
      lng: Number(draft.lng.toFixed(6)),
    };

    try {
      const { data } = await axios.post(`${API}/pins/`, payload, {
        headers: { "Content-Type": "application/json" },
      });

      setPins((p) => [data, ...p]);

      // Resetear el formulario ANTES de ocultarlo
      formEl.reset();

      // Ocultar el formulario / pin en borrador
      setDraft(null);
    } catch (err) {
      console.error("POST /pins/ failed", err.response?.data || err);
      alert(
        "No se pudo crear el pin: " +
          JSON.stringify(err.response?.data || {}, null, 2)
      );
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", height: "100vh" }}>
      <div>
        <MapContainer
          center={center}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(map) => (mapRef.current = map)}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToAdd />
          {pins.map((p) => (
            <Marker key={p.id} position={[Number(p.lat), Number(p.lng)]}>
              <Popup>
                <b>{p.title}</b>
                <br />
                {p.description}
                <br />
                <small>{p.category}</small>
              </Popup>
            </Marker>
          ))}
          {draft && (
            <Marker position={[draft.lat, draft.lng]}>
              <Popup>Nuevo pin aquí</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      <div style={{ padding: "16px", borderLeft: "1px solid #ddd" }}>
        <h3>Agregar pin</h3>
        {draft ? (
          <form onSubmit={createPin}>
            <label style={{ display: "block", marginTop: 8 }}>
              Título
              <input name="title" required style={{ width: "100%" }} />
            </label>
            <label style={{ display: "block", marginTop: 8 }}>
              Descripción
              <textarea name="description" rows={3} style={{ width: "100%" }} />
            </label>
            <label style={{ display: "block", marginTop: 8 }}>
              Categoría
              <input name="category" placeholder="cafe, parque..." style={{ width: "100%" }} />
            </label>
            <label style={{ display: "block", marginTop: 8 }}>
              Tags (coma)
              <input name="tags" placeholder="wifi, 24h" style={{ width: "100%" }} />
            </label>
            <label style={{ display: "block", marginTop: 8 }}>
              Rating
              <input name="rating" type="number" step="0.1" min="0" max="5" style={{ width: "100%" }} />
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
          </form>
        ) : (
          <p>Toca el mapa para elegir la ubicación.</p>
        )}
      </div>
    </div>
  );
}
