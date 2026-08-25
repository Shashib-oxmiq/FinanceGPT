import "./App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AuthCallback from "./pages/AuthCallback";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import Insurance from "./pages/Insurance";
import Vault from "./pages/Vault";
import FormFiller from "./pages/FormFiller";
import Bundler from "./pages/Bundler";
import Legacy from "./pages/Legacy";
import Insights from "./pages/Insights";
import Investments from "./pages/Investments";
import LoanPrep from "./pages/LoanPrep";
import LifeEvents from "./pages/LifeEvents";
import SharedView from "./pages/SharedView";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <span className="animate-pulse tracking-[0.3em] uppercase text-xs">Securing session…</span>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/share/:token" element={<SharedView />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/chat" element={<Protected><Chat /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/insurance" element={<Protected><Insurance /></Protected>} />
      <Route path="/insights" element={<Protected><Insights /></Protected>} />
      <Route path="/investments" element={<Protected><Investments /></Protected>} />
      <Route path="/loans" element={<Protected><LoanPrep /></Protected>} />
      <Route path="/life-events" element={<Protected><LifeEvents /></Protected>} />
      <Route path="/vault" element={<Protected><Vault /></Protected>} />
      <Route path="/forms" element={<Protected><FormFiller /></Protected>} />
      <Route path="/bundler" element={<Protected><Bundler /></Protected>} />
      <Route path="/legacy" element={<Protected><Legacy /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRouter />
          <Toaster position="top-right" richColors closeButton theme="dark" />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
