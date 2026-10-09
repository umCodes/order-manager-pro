import "./App.css";
import PrepPage, { type PrepRole } from "./pages/PrepPage";

/** Root for the warehouse screens (/prep for preparers, /driver for drivers) — the app frame, with no tab bar or office pages. */
export default function PrepApp({ role }: { role: PrepRole }) {
  return (
    <div className="app-frame">
      <div className="app-frame__body app-frame__body--prep">
        <PrepPage role={role} />
      </div>
    </div>
  );
}
