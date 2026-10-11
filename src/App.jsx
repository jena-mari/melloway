import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppProvider } from "./hooks/useApp";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Onboarding from "./pages/Onboarding";
import Generating from "./pages/Generating";
import Venue from "./pages/Venue";
import { useEffect, lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
const Community = lazy(() => import("./pages/Community"));
const CommunityRoute = lazy(() => import("./pages/CommunityRoute"));
const Pick = lazy(() => import("./pages/Pick"));
const Itinerary = lazy(() => import("./pages/Itinerary"));
const Favourites = lazy(() => import("./pages/Favourites"));
const Profile = lazy(() => import("./pages/Profile"));
const Events = lazy(() =>
  import("./pages/Discover").then((module) => ({ default: module.Events })),
);
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
              <Route
                path="/profile"
                element={
                  <Suspense
                    fallback={
                      <div className="page" role="status">
                        opening your profile…
                      </div>
                    }
                  >
                    <Profile />
                  </Suspense>
                }
              />
              <Route
                path="/itinerary"
                element={
                  <Suspense
                    fallback={
                      <div className="page" role="status">
                        bringing up ur day…
                      </div>
                    }
                  >
                    <Itinerary />
                  </Suspense>
                }
              />
              <Route
                path="/favourites"
                element={
                  <Suspense
                    fallback={
                      <div className="page" role="status">
                        bringing up ur saved things…
                      </div>
                    }
                  >
                    <Favourites />
                  </Suspense>
                }
              />
              <Route
                path="/community"
                element={
                  <Suspense
                    fallback={
                      <div className="page" role="status">
                        bringing up the ideas…
                      </div>
                    }
                  >
                    <Community />
                  </Suspense>
                }
              />
              {["/picks", "/picks/:pickId", "/picks/:pickId/venue/:id"].map(
                (path) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      <Suspense
                        fallback={
                          <div className="page" role="status">
                            opening the pick…
                          </div>
                        }
                      >
                        <Pick />
                      </Suspense>
                    }
                  />
                ),
              )}
              {["/community/:postId", "/community/:postId/venue/:id"].map(
                (path) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      <Suspense
                        fallback={
                          <div className="page" role="status">
                            opening the full route…
                          </div>
                        }
                      >
                        <CommunityRoute />
                      </Suspense>
                    }
                  />
                ),
              )}
              <Route
                path="/events"
                element={
                  <Suspense
                    fallback={
                      <div className="page" role="status">
                        bringing up the posters…
                      </div>
                    }
                  >
                    <Events />
                  </Suspense>
                }
              />
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
