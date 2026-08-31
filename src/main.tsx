import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// PWA: регистрируем service worker, чтобы игра работала офлайн
// и устанавливалась на телефон как приложение.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {
        /* офлайн-режим недоступен — играем онлайн */
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
