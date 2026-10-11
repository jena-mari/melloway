import { NavLink, Link, useOutlet, useLocation } from "react-router-dom";
import { useRef, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { gentleEase } from "./Introduction";
import DoodleBackdrop from "./DoodleBackdrop";
import BrandLogo from "./BrandLogo";
import { Heart, Compass, Sparkles, Bookmark, MapPin, Map } from "lucide-react";
import { useApp } from "../hooks/useApp";
import useKeyboard from "../hooks/useKeyboard";
import { Avatar } from "./CommunityIdentity";
const tabs = [
  { to: "/", name: "make a plan", label: "plan", icon: Heart },
  { to: "/community", name: "the community", label: "explore", icon: Compass },
  { to: "/events", name: "what’s on", label: "what’s on", icon: Sparkles },
  { to: "/favourites", name: "saved", label: "saved", icon: Bookmark },
];
export default function Layout() {
  const { status, setStatus, current, profile, draft } = useApp(),
    { pathname, search } = useLocation();
  const keyboardOpen = useKeyboard();
  const outlet = useOutlet(),
    reduced = useReducedMotion(),
    menu = useRef(null);
  const planning = pathname.startsWith("/plan/") || pathname === "/generating";
  const communityRoute = /^\/community\/[^/]+$/.test(pathname);
  const introduction =
    planning || pathname === "/" || pathname === "/itinerary" || communityRoute;
  const calendar =
    pathname === "/plan/details" &&
    new URLSearchParams(search).get("q") === "5";
  const result = pathname === "/itinerary" || communityRoute;
  const navigationTabs = current?.plan
    ? [
        tabs[0],
        { to: "/itinerary", name: "ur day", label: "ur day", icon: Map },
        ...tabs.slice(1),
      ]
    : tabs;
  useEffect(() => {
    menu.current?.close();
  }, [pathname]);
  return (
    <div
      className={`app-shell ${planning ? "planning" : ""} ${introduction ? "journey-shell" : ""} ${keyboardOpen ? "keyboard-open" : ""} ${calendar ? "calendar-shell" : ""}`}
    >
      <DoodleBackdrop screen={pathname} paused={keyboardOpen} />
      {!introduction &&
        pathname !== "/community" &&
        pathname !== "/profile" && (
          <header className="app-topbar">
            <Link to="/" className="wordmark" aria-label="melloway home">
              <BrandLogo decorative />
            </Link>
            <div className="topbar-account">
              <span className="city-label">
                <MapPin size={13} /> Sydney
              </span>
              <Link
                to="/profile"
                className="header-profile-link"
                aria-label="Your profile"
              >
                <Avatar
                  name={profile?.name || draft.name || "you"}
                  src={profile?.avatar}
                />
              </Link>
            </div>
          </header>
        )}
      <main id="main" tabIndex={-1}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0, y: -6 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: gentleEase }}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>
      {introduction && !result && (
        <button
          className="intro-signature"
          aria-label="Open melloway menu"
          onClick={() => menu.current?.showModal()}
        >
          <BrandLogo decorative />
        </button>
      )}
      <dialog
        ref={menu}
        className="mellow-menu"
        aria-labelledby="mellow-menu-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) menu.current.close();
        }}
      >
        <div>
          <h2 id="mellow-menu-title">a little more melloway.</h2>
          <nav aria-label="Explore melloway">
            <Link to="/profile" onClick={() => menu.current.close()}>
              your profile
            </Link>
            {navigationTabs.map(({ to, name, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => menu.current.close()}
                aria-label={name}
              >
                {label}
              </Link>
            ))}
          </nav>
          <button className="button" onClick={() => menu.current.close()}>
            close
          </button>
        </div>
      </dialog>
      {(!introduction || result) && (
        <nav className="bottom-tabs" aria-label="Main navigation">
          {navigationTabs.map(({ to, name, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              aria-label={name}
              className={({ isActive }) =>
                `tab ${isActive || (to === "/community" && pathname.startsWith("/picks")) ? "active" : ""}`
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
