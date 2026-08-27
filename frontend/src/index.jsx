import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";
import { resolveBackendUrl } from "./lib/api";
import { LanguageProvider } from "./contexts/LanguageContext";

// Default theme: dark (can be toggled in Layout)
const saved = localStorage.getItem("vault_theme");
if (saved === "light") {
  document.documentElement.classList.remove("dark");
} else {
  document.documentElement.classList.add("dark");
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
});

// Bootstrap: try to resolve the backend URL from Electron IPC, but NEVER block
// the render — if IPC hangs or fails, we still render with the default URL.
function render() {
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

// Race resolveBackendUrl against a 3-second timeout — render no matter what
Promise.race([
  resolveBackendUrl(),
  new Promise((r) => setTimeout(r, 3000)),
]).finally(render);