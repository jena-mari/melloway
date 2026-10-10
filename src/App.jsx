import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppProvider } from "./hooks/useApp";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Onboarding from "./pages/Onboarding";
import Generating from "./pages/Generating";
import Itinerary from "./pages/Itinerary";
import Favourites from "./pages/Favourites";
import { Community, Events } from "./pages/Discover";
import Venue from "./pages/Venue";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
function Scroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppProvider>
        <BrowserRouter>
          <Scroll />
          <a className="skip-link" href="#main">
            skip to content
          </a>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Landing />} />
              <Route path="/plan/:step" element={<Onboarding />} />
              <Route path="/generating" element={<Generating />} />
              <Route path="/itinerary" element={<Itinerary />} />
              <Route path="/favourites" element={<Favourites />} />
              <Route path="/community" element={<Community />} />
              <Route path="/events" element={<Events />} />
              <Route path="/venue/:id" element={<Venue />} />
              <Route
                path="*"
                element={
                  <div className="page">
                    <h1>let’s find ur way back.</h1>
                    <Link to="/">home, sweet home</Link>
                  </div>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </MotionConfig>
  );
}
