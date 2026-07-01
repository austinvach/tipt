import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";

const NotFound = lazy(() => import("@/pages/not-found"));
const Home = lazy(() => import("@/pages/Home"));
const Movies = lazy(() => import("@/pages/Movies"));
const News = lazy(() => import("@/pages/News"));
const NewsArticle = lazy(() => import("@/pages/NewsArticle"));
const Image = lazy(() => import("@/pages/Image"));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
      Loading demo...
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/vod" component={Movies} />
      <Route path="/news/:id" component={NewsArticle} />
      <Route path="/news" component={News} />
      <Route path="/image-gen" component={Image} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Suspense fallback={<RouteFallback />}>
        <Router />
      </Suspense>
    </WouterRouter>
  );
}

export default App;
