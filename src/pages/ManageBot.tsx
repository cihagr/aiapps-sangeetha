import React from "react";
import { useLocation } from "react-router-dom";
import ManageBots from "./bot/ManageBots";
import BotApp from "./bot/BotApp";
import BotList from "./bot/BotList";
import { AppSidebar } from "@/components/AppSidebar";
import "./bot/index.css";

export default function ManageBot() {
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const rawHash = (location.hash || "").replace(/^#\/?/, "");
  const routePath = rawHash.split("?")[0];

  let pageContent = <BotList key="botlist" />;
  if (routePath.includes("managebots") || rawHash.includes("managebots")) {
    pageContent = <ManageBots key="managebots" />;
  } else if (routePath.includes("botapp") || rawHash.includes("botapp") || params.has("bot")) {
    pageContent = <BotApp key="botapp" />;
  } else {
    pageContent = <BotList key="botlist" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar />
      <div className="ml-0 lg:ml-52 min-h-screen flex flex-col">
        {pageContent}
      </div>
    </div>
  );
}
