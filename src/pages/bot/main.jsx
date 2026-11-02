import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./Dashboard";
import ManageBots from "./ManageBots";
import BotList from "./BotList";
import BotApp from "./BotApp";
import "./index.css";

// Hash-based routing stitches the full workflow:
//   #/                    -> AI Tools Dashboard (shows "My Chat Bots" card once bots exist)
//   #/managebots          -> Manage Bots admin dashboard (create bots here)
//   #/botlist             -> My Chat Bots list
//   #/botapp?bot=<id>     -> live Bot App for one bot
function routeFor() {
  const raw = location.hash.replace(/^#\/?/, "");
  const path = raw.split("?")[0];
  if (path === "managebots") return <ManageBots />;
  if (path === "botlist") return <BotList />;
  if (path === "botapp" || new URLSearchParams(location.search).has("bot")) return <BotApp />;
  return <BotList />;
}

function App() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return routeFor();
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);
