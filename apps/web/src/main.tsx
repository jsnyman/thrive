import { bootstrapApp } from "./bootstrap";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing #root element");
}

void bootstrapApp(rootElement);
