import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { Heart, Compass, Sparkles, Bookmark, MapPin } from "lucide-react";
import { useApp } from "../hooks/useApp";
import useKeyboard from "../hooks/useKeyboard";
const tabs = [
  { to: "/", name: "make a plan", label: "plan", icon: Heart },
  { to: "/community", name: "the community", label: "ideas", icon: Compass },
  { to: "/events", name: "what’s on", label: "what’s on", icon: Sparkles },
  { to: "/favourites", name: "saved", label: "saved", icon: Bookmark },
];
export default function Layout() {
  const { status, setStatus } = useApp(),
    { pathname } = useLocation();
  const keyboardOpen = useKeyboard();
  const planning = pathname.startsWith("/plan/") || pathname === "/generating";
  return (
    <div
      className={`app-shell ${planning ? "planning" : ""} ${keyboardOpen ? "keyboard-open" : ""}`}
    >
      <header className="app-topbar">
        <Link to="/" className="wordmark" aria-label="melloway home">
          melloway<span>✳</span>
        </Link>
        <span className="city-label">
          <MapPin size={13} /> Sydney
        </span>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      {!planning && (
        <nav className="bottom-tabs" aria-label="Main navigation">
          {tabs.map(({ to, name, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              aria-label={name}
              className={({ isActive }) =>
                `tab ${isActive || (to === "/" && (pathname === "/itinerary" || pathname.startsWith("/venue/"))) ? "active" : ""}`
              }
            >
              <span className="tab-icon">
                <Icon size={21} strokeWidth={1.6} />
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
      {status && (
        <div className="toast" role="status">
          {status}
          <button
            aria-label="Dismiss notification"
            onClick={() => setStatus("")}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
