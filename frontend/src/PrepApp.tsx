import { useState } from "react";
import "./App.css";
import { usePrepOrders } from "./hooks/usePrepOrders";
import PreparationPage from "./pages/PreparationPage";
import PrepItemsPage from "./pages/PrepItemsPage";
import PrepShipPage from "./pages/PrepShipPage";
import PrepTabBar, { type PrepTab } from "./components/preparation/PrepTabBar";

/**
 * Root for the preparation app at /prep: its own bottom tabs (Prepare,
 * Ship, Items) and none of the office pages. Prepare and Items share one
 * set of orders and the same selected day, so switching tabs keeps your
 * place and an amount recorded on one shows on the other.
 */
export default function PrepApp() {
  const prep = usePrepOrders();
  const [tab, setTab] = useState<PrepTab>("prepare");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  return (
    <div className="app-frame">
      <div className="app-frame__body">
        {tab === "prepare" && <PreparationPage prep={prep} selectedDate={selectedDate} onSelectDate={setSelectedDate} />}
        {tab === "ship" && <PrepShipPage />}
        {tab === "items" && <PrepItemsPage prep={prep} selectedDate={selectedDate} onSelectDate={setSelectedDate} />}
      </div>
      <PrepTabBar active={tab} onChange={setTab} />
    </div>
  );
}
