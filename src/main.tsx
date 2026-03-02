import { createRoot } from "react-dom/client";
import { Suspense } from "react";
import App from "./App.tsx";
import "./index.css";

// Lazy load the main app for better performance
const AppWrapper = () => (
  <Suspense fallback={
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg gradient-brand animate-pulse">
          <span className="text-xl font-bold text-primary-foreground">V</span>
        </div>
        <p className="text-sm text-muted-foreground">Loading Vura...</p>
      </div>
    </div>
  }>
    <App />
  </Suspense>
);

createRoot(document.getElementById("root")!).render(<AppWrapper />);
