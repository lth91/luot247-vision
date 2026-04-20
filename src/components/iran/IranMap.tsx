import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "@/components/ui/card";
import { Map as MapIcon } from "lucide-react";
import { useIranNews } from "@/hooks/useIranNews";

const SEVERITY_COLOR: Record<number, string> = {
  5: "#dc2626",
  4: "#f97316",
  3: "#f59e0b",
  2: "#3b82f6",
  1: "#94a3b8",
  0: "#94a3b8",
};

// Tâm khu vực Trung Đông
const CENTER: [number, number] = [32, 45];

export function IranMap() {
  const { data } = useIranNews(null, 120);

  const pins = useMemo(
    () => (data ?? []).filter(n => n.lat != null && n.lng != null),
    [data]
  );

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-2 p-4 pb-2">
        <MapIcon className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm">Conflict Map</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {pins.length} geolocated
        </span>
      </div>
      <div className="h-[400px] w-full">
        <MapContainer
          center={CENTER}
          zoom={4}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {pins.map(p => {
            const sev = p.severity ?? 0;
            const color = SEVERITY_COLOR[sev] ?? SEVERITY_COLOR[0];
            return (
              <CircleMarker
                key={p.id}
                center={[p.lat!, p.lng!]}
                radius={Math.max(4, sev * 2)}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.7, weight: 1 }}
              >
                <Popup>
                  <div className="text-xs max-w-[240px]">
                    <div className="font-semibold mb-1">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground mb-1">
                      {p.source_name} · {new Date(p.published_at).toLocaleString()}
                    </div>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Read source →
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </Card>
  );
}

export default IranMap;
