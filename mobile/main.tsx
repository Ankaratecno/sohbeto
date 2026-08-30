import React from "react";
import { createRoot } from "react-dom/client";
import Sohbeto from "@/components/Sohbeto";
import "@/styles.css";

const el = document.getElementById("root")!;
createRoot(el).render(
  <React.StrictMode>
    <Sohbeto />
  </React.StrictMode>,
);
