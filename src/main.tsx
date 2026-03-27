import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import ImagePage from "./components/ImagePage";
import { useStore } from "./store";
import RootLayout from "./components/RootLayout";
import WebcamPage from "./components/WebcamPage";

const rootRoute = createRootRoute({ component: RootLayout });
const webcamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: WebcamPage,
  onLeave: () => {
    const { stopWebcam, clearOutput, isWebcamActive } = useStore.getState();
    if (isWebcamActive) stopWebcam();
    clearOutput();
  },
});
const imageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/image",
  component: ImagePage,
  onLeave: () => {
    useStore.getState().clearOutput();
  },
});
const routeTree = rootRoute.addChildren([webcamRoute, imageRoute]);
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
