import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./context";
import "./style.css";

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <AppProvider>
      <div id="app-shell" className="app-shell">
        <App />
      </div>
    </AppProvider>
  </React.StrictMode>,
);
