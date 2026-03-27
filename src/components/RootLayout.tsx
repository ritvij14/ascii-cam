import { Link, Outlet } from "@tanstack/react-router";

const RootLayout = () => (
  <div className="bg-gray-950 text-white min-h-dvh flex flex-col">
    <nav className="flex gap-1 px-4 pt-3 pb-0 z-30 relative">
      <Link
        to="/"
        className="px-4 py-1.5 rounded-t-lg text-xs font-mono font-semibold transition"
        activeProps={{ style: { backgroundColor: "#ffffff", color: "#000" } }}
        inactiveProps={{ style: { backgroundColor: "rgba(31,41,55,0.8)", color: "#9ca3af", border: "1px solid #374151" } }}
      >
        WEBCAM
      </Link>
      <Link
        to="/image"
        className="px-4 py-1.5 rounded-t-lg text-xs font-mono font-semibold transition"
        activeProps={{ style: { backgroundColor: "#ffffff", color: "#000" } }}
        inactiveProps={{ style: { backgroundColor: "rgba(31,41,55,0.8)", color: "#9ca3af", border: "1px solid #374151" } }}
      >
        IMAGE
      </Link>
    </nav>
    <div className="flex-1 relative">
      <Outlet />
    </div>
  </div>
);

export default RootLayout;
