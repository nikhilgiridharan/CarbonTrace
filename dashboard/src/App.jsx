import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar.jsx";
import Topbar from "./components/layout/Topbar.jsx";
import StatusBar from "./components/layout/StatusBar.jsx";
import Dashboard from "./views/Dashboard.jsx";
import Suppliers from "./views/Suppliers.jsx";
import SKUAttribution from "./views/SKUAttribution.jsx";
import Forecast from "./views/Forecast.jsx";
import GoFundMe from "./views/GoFundMe.jsx";
import Introduction from "./views/Introduction.jsx";
import { useEmissionsSummary } from "./hooks/useEmissionsData.js";
import { wsAlertsUrl, wsPipelineUrl } from "./utils/constants.js";
import { ensureGoFundMeAudioPlayer } from "./utils/goFundMeAudio.js";

function titles(pathname) {
  const p = pathname.startsWith("/dashboard") ? pathname.slice("/dashboard".length) || "/" : pathname;
  if (p.startsWith("/suppliers")) return "Suppliers";
  if (p.startsWith("/skus")) return "SKU attribution";
  if (p.startsWith("/forecast")) return "Forecast";
  if (p.startsWith("/go-fund-me")) return "Conclusion";
  return "Overview";
}

function Shell() {
  const loc = useLocation();
  const title = useMemo(() => titles(loc.pathname), [loc.pathname]);
  const { data: summary } = useEmissionsSummary();
  const [liveAlert, setLiveAlert] = useState(null);
  const [pipelineMsg, setPipelineMsg] = useState(null);
  const [pipelineOk, setPipelineOk] = useState(true);

  useEffect(() => {
    ensureGoFundMeAudioPlayer().catch(() => {
      /* best-effort prewarm for click-to-play */
    });
  }, []);

  useEffect(() => {
    const url = wsAlertsUrl();
    if (!url) return undefined;
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      try {
        setLiveAlert(JSON.parse(ev.data));
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => setPipelineOk(false);
    return () => ws.close();
  }, []);

  useEffect(() => {
    const url = wsPipelineUrl();
    if (!url) return undefined;
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      try {
        setPipelineMsg(JSON.parse(ev.data));
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => setPipelineOk(false);
    return () => ws.close();
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar pipelineOk={pipelineOk} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar title={title} summary={summary} pipelineMessage={pipelineMsg} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <Routes>
            <Route index element={<Dashboard liveAlerts={liveAlert} />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="skus" element={<SKUAttribution />} />
            <Route path="forecast" element={<Forecast />} />
            <Route path="go-fund-me" element={<GoFundMe />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
        <StatusBar text="Verdant · Scope 3 emissions intelligence" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Introduction />} />
        <Route path="/introduction" element={<Introduction />} />
        <Route path="/dashboard/*" element={<Shell />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
