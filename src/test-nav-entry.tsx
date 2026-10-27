import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { IsolatedNavigationTestPage } from "./components/IsolatedNavigationTestPage";
import "./index.css";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <IsolatedNavigationTestPage />
    </StrictMode>
  );
}
