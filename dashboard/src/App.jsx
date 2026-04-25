import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar.jsx";
import Topbar from "./components/layout/Topbar.jsx";
import StatusBar from "./components/layout/StatusBar.jsx";
import { useEmissionsSummary } from "./hooks/useEmissionsData.js";
import { wsAlertsUrl, wsPipelineUrl } from "./utils/constants.js";
import { ensureGoFundMeAudioPlayer } from "./utils/goFundMeAudio.js";
import { useWebSocket } from "./hooks/useWebSocket.js";

const Dashboard = lazy(() => import("./views/Dashboard.jsx"));
const AskVerdant = lazy(() => import("./views/AskVerdant.jsx"));
const Suppliers = lazy(() => import("./views/Suppliers.jsx"));
const SKUAttribution = lazy(() => import("./views/SKUAttribution.jsx"));
const SupplierNetwork = lazy(() => import("./views/SupplierNetwork.jsx"));
const ScenarioEngine = lazy(() => import("./views/ScenarioEngine.jsx"));
const Forecast = lazy(() => import("./views/Forecast.jsx"));
const Wiki = lazy(() => import("./views/Wiki.jsx"));
const GoFundMe = lazy(() => import("./views/GoFundMe.jsx"));
const Introduction = lazy(() => import("./views/Introduction.jsx"));

const fullPageLoading = (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      color: "var(--text-tertiary)",
      fontSize: "13px",
    }}
  >
    Loading...
  </div>
);

function titles(pathname) {
  const p = pathname.startsWith("/dashboard") ? pathname.slice("/dashboard".length) || "/" : pathname;
  if (p.startsWith("/suppliers")) return "Suppliers";
  if (p.startsWith("/ask")) return "Ask Verdant";
  if (p.startsWith("/skus")) return "SKU attribution";
  if (p.startsWith("/network")) return "Network";
  if (p.startsWith("/scenarios")) return "Scenarios";
  if (p.startsWith("/forecast")) return "Forecast";
  if (p.startsWith("/settings")) return "Settings";
  if (p.startsWith("/wiki")) return "Wiki";
  if (p.startsWith("/go-fund-me")) return "Conclusion";
  return "Overview";
}

function Shell() {
  const loc = useLocation();
  const title = useMemo(() => titles(loc.pathname), [loc.pathname]);
  const { data: summary } = useEmissionsSummary();
  const [liveAlert, setLiveAlert] = useState(null);
  const [pipelineMsg, setPipelineMsg] = useState(null);
  const [pipelineOk] = useState(true);
  const handleAlertMessage = useCallback((data) => setLiveAlert(data), []);
  const handlePipelineMessage = useCallback((data) => setPipelineMsg(data), []);

  useEffect(() => {
    ensureGoFundMeAudioPlayer().catch(() => {
      /* best-effort prewarm for click-to-play */
    });
  }, []);

  useWebSocket(wsAlertsUrl, { onMessage: handleAlertMessage });
  useWebSocket(wsPipelineUrl, { onMessage: handlePipelineMessage });

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar pipelineOk={pipelineOk} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar title={title} summary={summary} pipelineMessage={pipelineMsg} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <Suspense fallback={fullPageLoading}>
            <Routes>
              <Route index element={<Dashboard liveAlerts={liveAlert} />} />
              <Route path="ask" element={<AskVerdant />} />
              <Route path="suppliers" element={<Suppliers />} />
              <Route path="skus" element={<SKUAttribution />} />
              <Route path="network" element={<SupplierNetwork />} />
              <Route path="scenarios" element={<ScenarioEngine />} />
              <Route path="forecast" element={<Forecast />} />
              <Route path="wiki" element={<Wiki />} />
              <Route path="go-fund-me" element={<GoFundMe />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </div>
        <StatusBar text="Verdant · Scope 3 emissions intelligence" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={fullPageLoading}>
        <Routes>
          <Route path="/" element={<Introduction />} />
          <Route path="/introduction" element={<Introduction />} />
          <Route path="/dashboard/*" element={<Shell />} />
          <Route path="/ask" element={<Navigate to="/dashboard/ask" replace />} />
          <Route path="/suppliers" element={<Navigate to="/dashboard/suppliers" replace />} />
          <Route path="/skus" element={<Navigate to="/dashboard/skus" replace />} />
          <Route path="/network" element={<Navigate to="/dashboard/network" replace />} />
          <Route path="/scenarios" element={<Navigate to="/dashboard/scenarios" replace />} />
          <Route path="/forecast" element={<Navigate to="/dashboard/forecast" replace />} />
          <Route path="/wiki" element={<Navigate to="/dashboard/wiki" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
